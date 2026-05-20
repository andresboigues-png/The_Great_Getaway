"""External integrations — currently just the Gemini AI itinerary
generator. /api/config exposes the public Google client id used by
the frontend's GIS button.

Phase G slice 1 — Maps verification: after Gemini returns the freeform
itinerary, each suggested item is run through Google Places Text Search
to resolve a real placeId. Verified items get enriched with
photoUrl / rating / address / mapsUrl so the frontend can render them
as rich tappable cards. Items the lookup can't resolve get flagged as
`verified: false` — the explicit hallucination signal the ROADMAP
done-check calls for. Gracefully no-ops when GOOGLE_MAPS_API_KEY
isn't set (items stay as strings, frontend renders the legacy
text-bullet form).
"""

import json
import logging
import os
import time

import requests
from flask import Blueprint, jsonify, request

from auth import require_auth
from extensions import limiter


logger = logging.getLogger(__name__)
bp = Blueprint("integrations", __name__)


# ── Gemini host-key pool ──────────────────────────────────────────
#
# The free-tier Gemini API has a per-key daily quota. To give users
# significant headroom before they need to bring their own key, we
# rotate through up to N host-side keys (GEMINI_API_KEY,
# GEMINI_API_KEY_2, … GEMINI_API_KEY_<N>) on each request. When a
# key returns RESOURCE_EXHAUSTED / 429, it's marked cooled for 24h
# (Gemini's daily-quota window). The next request skips cooled keys
# and tries the rest.
#
# State is in-memory, shared across requests within a single WSGI
# process. PA's free tier runs a single worker so this is consistent
# globally. A WSGI reload clears the state — at worst that means a
# few API calls land on quota-exhausted keys before being re-marked.
# Acceptable: Gemini's response is fast and the rotation continues.
#
# The frontend reads `_pool_status()` via /api/gemini/host-keys/
# status to drive the AI-page "usage bar" (filled portion =
# exhausted / total). The bar is intentionally shared/global since
# every user pulls from the same key pool.

# 24h matches Gemini's daily-quota reset window. A per-minute rate
# hit will also cool the key for 24h here (we can't easily tell them
# apart from the error message). That's pessimistic but it's the
# safe default — re-trying a known-bad key burns latency on every
# generation; under-using a still-good key just means we move to
# the next one slightly sooner.
_KEY_COOLDOWN_SECONDS = 24 * 3600
_HOST_KEY_SLOTS = 6  # GEMINI_API_KEY + _2 through _6
_exhausted_keys: dict[int, float] = {}  # key_slot (1..N) → timestamp


def _host_key_for_slot(slot: int) -> str:
    """Return the env-var value for a given slot. Slot 1 is the
    bare GEMINI_API_KEY (legacy); slots 2..N are GEMINI_API_KEY_2
    through GEMINI_API_KEY_N."""
    if slot == 1:
        return os.getenv("GEMINI_API_KEY", "") or ""
    return os.getenv(f"GEMINI_API_KEY_{slot}", "") or ""


def _is_key_cooled(slot: int) -> bool:
    """True if `slot` is currently marked exhausted AND the
    cooldown hasn't expired. Side-effect: clears stale entries so
    the dict doesn't grow unbounded across long-running processes."""
    ts = _exhausted_keys.get(slot)
    if ts is None:
        return False
    if time.time() - ts >= _KEY_COOLDOWN_SECONDS:
        del _exhausted_keys[slot]
        return False
    return True


def _mark_key_exhausted(slot: int) -> None:
    """Stamp a key as exhausted at the current time. Cleared
    automatically by `_is_key_cooled` once the 24h window passes."""
    _exhausted_keys[slot] = time.time()
    logger.warning(
        "gemini host key slot %d marked exhausted (24h cooldown)", slot,
    )


def _available_host_keys() -> list[tuple[int, str]]:
    """Return (slot, key) pairs for every configured host key that
    isn't currently cooled. Order matches slot number so the
    rotation is deterministic — slot 1 always tries first, then 2,
    etc. Empty / missing env vars are filtered out (a user only
    configures the slots they have keys for)."""
    out: list[tuple[int, str]] = []
    for slot in range(1, _HOST_KEY_SLOTS + 1):
        key = _host_key_for_slot(slot)
        if not key:
            continue
        if _is_key_cooled(slot):
            continue
        out.append((slot, key))
    return out


def _pool_status() -> dict:
    """Snapshot of the host-key pool for the frontend usage bar.
    `total` = configured slots that have a key set in env (not the
    theoretical 6). `exhausted` = currently cooled. `available` =
    `total - exhausted`. Frontend can compute the fill ratio as
    `exhausted / total` (so the bar fills as the pool drains)."""
    total = 0
    exhausted = 0
    for slot in range(1, _HOST_KEY_SLOTS + 1):
        if not _host_key_for_slot(slot):
            continue
        total += 1
        if _is_key_cooled(slot):
            exhausted += 1
    return {
        "total": total,
        "exhausted": exhausted,
        "available": total - exhausted,
    }


def _looks_like_quota_error(err_msg: str) -> bool:
    """Match the strings Gemini returns when a key has hit its
    quota. We try the next key in the pool on these; other errors
    (network, model 500s, INVALID_REQUEST) propagate to the user
    without rotating — there's no reason to think the next key
    would behave differently."""
    s = err_msg.lower()
    return (
        "resource_exhausted" in s
        or "quota" in s
        or "rate limit" in s
        or "429" in s
        or "exceeded" in s
    )


@bp.route("/api/gemini/host-keys/status", methods=["GET"])
@require_auth
def gemini_host_keys_status():
    """Lightweight read of the host-key pool state. Called by
    pages/ai/AI.tsx on mount + periodically while the AI page is
    open, to drive the usage bar visible to every user.

    Auth-gated so anonymous traffic can't probe how much of the
    quota is left (which would let them time their own
    quota-burning script to land when the pool is healthy)."""
    return jsonify(_pool_status())


def _verify_place(query: str, destination: str, api_key: str) -> dict | None:
    """Resolve `<query> in <destination>` to a real Google Maps place via
    Places API NEW (`places.googleapis.com/v1/places:searchText`).
    Returns enriched fields on a hit, None on miss / error / missing key.
    Network errors are logged + swallowed: a verification miss is a soft
    failure (the item just renders unverified), never a 500.

    The FieldMask is the cost-control lever — Places API NEW bills per
    requested field group, so we ask for ONLY what the AI card uses.
    Adding a field here = paying for it on every itinerary generation.
    """
    if not api_key or not query:
        return None
    text_query = f"{query} in {destination}".strip() if destination else query
    try:
        url = "https://places.googleapis.com/v1/places:searchText"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            # FieldMask:
            #   - id, displayName, formattedAddress, location,
            #     photos.name, types are Places API NEW "Basic Data"
            #     tier (cheapest).
            #   - rating, userRatingCount are "Advanced Data" tier.
            # Pricing is set by the highest tier in the mask, so we're
            # already paying Advanced. Adding `location` + `types`
            # (both Basic) is free at this tier. `types` is what the
            # frontend uses to bucket each AI item into the right POI
            # category (Restaurants / Hotels / Sights / …) on the
            # to-do list — without it every AI item fell into the
            # generic "Other places" group.
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.location,places.rating,places.userRatingCount,"
                "places.googleMapsUri,places.photos.name,places.types"
            ),
        }
        payload = {"textQuery": text_query, "maxResultCount": 1}
        # 2026-05-20: wrap in `with` to release the socket on exit —
        # prevents FD accumulation under sustained Places verification
        # traffic.
        with requests.post(url, headers=headers, json=payload, timeout=8) as resp:
            if not resp.ok:
                logger.info(f"Places verification miss ({resp.status_code}) for: {text_query}")
                return None
            data = resp.json()
        places = data.get("places", [])
        if not places:
            return None
        p = places[0]
        # Photo URL — Places API NEW serves photos via the place name +
        # photo name path; the frontend hot-links this URL. Photo serving
        # itself isn't billed (the billable hit is the searchText
        # request above; the photo URL is a static-image redirect).
        photo_url = None
        photos = p.get("photos") or []
        if photos:
            photo_name = photos[0].get("name")
            if photo_name:
                photo_url = (
                    f"https://places.googleapis.com/v1/{photo_name}/media"
                    f"?key={api_key}&maxWidthPx=480&maxHeightPx=320"
                )
        location = p.get("location") or {}
        return {
            "placeId": p.get("id"),
            "verifiedName": (p.get("displayName") or {}).get("text"),
            "address": p.get("formattedAddress"),
            "rating": p.get("rating"),
            "userRatingsTotal": p.get("userRatingCount"),
            "mapsUrl": p.get("googleMapsUri"),
            "photoUrl": photo_url,
            # Phase G slice 2: lat/lng so the frontend can drop a
            # to-do marker for AI-suggested places without a separate
            # Place Details fetch. Added to FieldMask above (Basic
            # tier — free at the Advanced tier we're already paying).
            "lat": location.get("latitude"),
            "lng": location.get("longitude"),
            # Google Places `types[]` array — drives client-side
            # category bucketing via guessCategoryByTypes() so AI
            # items land under Restaurants / Hotels / Sights / …
            # rather than the generic "Other places" group. Always
            # an array (empty if Places didn't return any types).
            "types": p.get("types") or [],
        }
    except Exception as e:
        logger.warning(f"Places verification error for '{text_query}': {e}")
        return None


def _enrich_itinerary(itinerary: list, destination: str) -> list:
    """For every item in every slot of every day, resolve via Places API
    Text Search and rewrite the item from a string to an object:
        { text, verified, placeId?, photoUrl?, rating?, address?, ... }

    Items the lookup can't resolve become `{ text, verified: false }` —
    the frontend renders those with an "unverified" chip so the user
    knows the LLM made it up vs. cited a real place. A per-itinerary
    cache de-dupes lookups (the LLM often mentions the same landmark
    in multiple slots — we pay the API once).

    No-op when no Maps key is configured — items stay as strings,
    frontend's renderSlotBody falls through to the legacy text-bullet
    rendering. Lets dev / self-hosted setups skip the Maps integration
    without breaking anything; verification is value-add, not structural.

    Key resolution: prefer `GOOGLE_MAPS_SERVER_KEY` (a server-only key
    with no HTTP referrer restriction — the right shape for outbound
    POSTs to places.googleapis.com) and fall back to the legacy
    `GOOGLE_MAPS_API_KEY` if the server key isn't set. The legacy var
    is still passed through the index.html template for the browser-
    side Maps JS API, where it SHOULD remain referrer-restricted —
    splitting them lets the public key stay locked down while the
    server side can call Places without the empty-referrer rejection.
    """
    api_key = (
        os.getenv("GOOGLE_MAPS_SERVER_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or ""
    )
    if not api_key:
        return itinerary

    cache: dict[str, dict | None] = {}

    def resolve(item_text: str) -> dict | None:
        if item_text in cache:
            return cache[item_text]
        meta = _verify_place(item_text, destination, api_key)
        cache[item_text] = meta
        return meta

    def _enrich_one(raw) -> dict | None:
        """Resolve a single place dict / string against Places API and
        emit the verified-card shape the frontend's slots.ts expects.
        Returns None if there's no text to verify (lets callers drop
        the entry cleanly)."""
        if isinstance(raw, dict):
            text = str(raw.get("name") or "").strip()
            why = str(raw.get("why") or "").strip()
            fact = str(raw.get("fact") or "").strip()
        elif isinstance(raw, str):
            text = raw.strip()
            why = ""
            fact = ""
        else:
            text = str(raw or "").strip()
            why = ""
            fact = ""
        if not text:
            return None
        meta = resolve(text)
        base: dict = {"text": text}
        if why:
            base["why"] = why
        if fact:
            base["fact"] = fact
        if meta and meta.get("placeId"):
            return {**base, "verified": True, **meta}
        return {**base, "verified": False}

    for day in itinerary or []:
        if not isinstance(day, dict):
            continue
        # NEW schema (post-food/sights split) — singletons for each
        # meal slot. Each is a dict, not a slot-with-items array.
        for meal in ("breakfast", "lunch", "dinner"):
            slot = day.get(meal)
            if not isinstance(slot, dict):
                continue
            enriched = _enrich_one(slot)
            if enriched is not None:
                day[meal] = enriched
        # NEW schema — top-level `sights` list, separate from meals.
        sights = day.get("sights")
        if isinstance(sights, list):
            day["sights"] = [
                e for e in (_enrich_one(s) for s in sights) if e is not None
            ]
        # LEGACY schema — morning/afternoon/evening each have an
        # items[] list mixed with restaurants + sights. Older saved
        # itineraries flow through here so the rerender path doesn't
        # break for users with cached aiPlan blobs in localStorage.
        for slot_name in ("morning", "afternoon", "evening"):
            slot = day.get(slot_name)
            if not isinstance(slot, dict):
                continue
            items = slot.get("items")
            if not isinstance(items, list):
                continue
            new_items: list[dict] = []
            for raw in items:
                enriched = _enrich_one(raw)
                if enriched is not None:
                    new_items.append(enriched)
            slot["items"] = new_items
    return itinerary


@bp.route("/api/config", methods=["GET"])
def get_config():
    """Expose ONLY non-sensitive client config — currently the public
    Google OAuth client id used by the GIS sign-in button.

    Security note: this endpoint used to also return `gemini_key` /
    `openai_key` from server env so the AI page could "auto-fill" the
    user's key field. That meant the host's LLM key was shipped to
    every page load — anyone viewing /api/config (or just View Source
    after the fetch) could lift it. Removed in favour of strict BYO:
    the AI page reads the user's saved key from localStorage (the
    `geminiApiKey` field of STATE), and the user pastes their own
    Gemini key in Settings to enable AI generation. The host's
    GEMINI_API_KEY env var is still honoured server-side as a fallback
    in /api/generate_itinerary (see route below) for self-hosted
    setups where the operator IS the user."""
    return jsonify({
        "google_client_id": os.getenv("CLIENT_ID_GOOGLE_AUTH", ""),
    })


@bp.route("/api/generate_itinerary", methods=["POST"])
@limiter.limit("10 per hour")
@require_auth
def generate_itinerary():
    """Call Gemini API to generate a structured JSON itinerary.
    Auth gate (and the JWT origin requirement) prevents anonymous
    traffic from burning paid LLM quota.

    FIXING_ROADMAP §2.16:
    - Added a 10/hour rate limit. The endpoint hits a paid external
      API (Gemini), and a logged-in attacker could otherwise script
      it to burn the host's quota OR (with their own gemini_key)
      script it as a free LLM proxy. 10/hour is generous for real
      planning sessions but kills automation.
    - destination / context are interpolated into the prompt — they
      need to be length-capped and stripped of control chars to
      blunt prompt-injection attacks. We can't fully prevent prompt
      injection without RLHF in the model, but cutting 50KB exploit
      strings down to short bounded text + dropping newlines makes
      the obvious "Ignore previous instructions" tricks much harder.
    """
    data = request.json or {}
    destination = str(data.get("destination", "Unknown"))[:120]
    num_days_raw = data.get("numDays", 3)
    try:
        num_days = max(1, min(30, int(num_days_raw)))
    except (TypeError, ValueError):
        num_days = 3
    date_from = str(data.get("dateFrom", ""))[:32]
    date_to = str(data.get("dateTo", ""))[:32]
    # The legacy single-context field stays accepted for back-compat
    # with any in-flight client that hasn't reloaded yet. The new
    # food / sightseeing split is the primary path — splitting the
    # ask makes the LLM produce one restaurant per meal slot AND a
    # separate sightseeing list, which the UI then renders as two
    # distinct clusters per day instead of mixed-bag items[].
    food_context = str(data.get("foodContext", ""))[:500]
    sights_context = str(data.get("sightseeingContext", ""))[:500]
    legacy_context = str(data.get("context", ""))[:500]
    # Strip control chars (incl. newlines) from destination + dates +
    # context so a prompt injection can't smuggle in an instruction
    # break via "\n\nIgnore the previous instructions". The model
    # sees a single-line, bounded string for each user field.
    def _scrub(s: str) -> str:
        return "".join(c for c in s if ord(c) >= 0x20 and c not in "\r\n\t")
    destination = _scrub(destination).strip()
    date_from = _scrub(date_from).strip()
    date_to = _scrub(date_to).strip()
    food_context = _scrub(food_context).strip()
    sights_context = _scrub(sights_context).strip()
    legacy_context = _scrub(legacy_context).strip()

    # BYO key path: client sends its own Gemini key in the request
    # body so power users (or the user whose pool we exhausted) can
    # keep generating. We never persist this to disk — used for
    # the API call only and then discarded with the request
    # lifecycle.
    #
    # If BYO key is set, we try ONLY that key (no rotation — the
    # host pool isn't ours to spend on a user who's brought their
    # own).
    #
    # If no BYO key, we walk the host pool in slot order, skipping
    # any slot whose key is currently marked cooled. On a quota
    # error from a key, we mark it cooled and try the next slot.
    # Other errors (network, model 500s, invalid request)
    # propagate immediately — those aren't pool-rotation events.
    user_key = (data.get("gemini_key") or "").strip()
    keys_to_try: list[tuple[int, str]] = []
    if user_key:
        keys_to_try.append((0, user_key))  # slot 0 = BYO
    else:
        keys_to_try = _available_host_keys()

    if not keys_to_try:
        return jsonify({
            "error": (
                "Today's shared AI quota is fully booked. Add your own "
                "Gemini API key (free for personal use) to keep generating."
            ),
            "host_keys": _pool_status(),
        }), 429

    # Build the prompt's "additional context" block. Two named fields
    # (food + sightseeing) read more directly to the model than one
    # mixed paragraph, and they let the user say things like "we hate
    # spicy food" without that getting picked up by the sightseeing
    # generator. Legacy `context` is appended as a fallback so any
    # client running the old single-textarea version still works.
    context_lines: list[str] = []
    if food_context:
        context_lines.append(f"Food preferences: {food_context}")
    if sights_context:
        context_lines.append(f"Sightseeing preferences: {sights_context}")
    if legacy_context and not (food_context or sights_context):
        context_lines.append(f"Additional context: {legacy_context}")
    context_block = "\n    ".join(context_lines) or "Additional context: (none provided)"

    prompt = f"""
    You are an expert travel planner. Create a detailed {num_days}-day itinerary for {destination} from {date_from} to {date_to}.
    {context_block}

    CRITICAL INSTRUCTION: You MUST return ONLY valid JSON. Do not wrap the JSON in markdown blocks.

    For EACH day, return:
      - ONE breakfast restaurant (`breakfast`)
      - ONE lunch restaurant (`lunch`)
      - ONE dinner restaurant (`dinner`)
      - A list of 2–4 sightseeing places (`sights`) for the day, in the
        order the traveller should visit them. Sights are SEPARATE from
        meals so the user can see eating and sightseeing as two distinct
        clusters.

    Each restaurant (breakfast / lunch / dinner) and each sight is an object with three fields:
      - `name`:  the REAL specific place name in {destination}. This is what the user is going there to see / do / eat.
      - `why`:   ONE short sentence (max ~18 words) explaining why this place was chosen — what makes it worth the stop, why it pairs well with the rest of the day, or what kind of traveller it suits. Direct and concrete, no fluff.
      - `fact`:  ONE short surprising fact (max ~22 words) about the place — historical, cultural, or quirky. Avoid generic statements ("it's famous") — give the user something they didn't already know that they'd be excited to mention.
    Both `why` and `fact` MUST be filled (non-empty strings). They appear under each place card in the UI; an empty string would render an awkward gap.

    Also include a "mainLocation" field with the name of the most iconic place visited that day (used for map geocoding).

    Schema:
    [
      {{
        "day": 1,
        "date": "{date_from}",
        "title": "Day title",
        "mainLocation": "Specific place name",
        "breakfast": {{"name": "Cafe name",     "why": "Why this fits.", "fact": "Surprising fact."}},
        "lunch":     {{"name": "Bistro name",   "why": "...",            "fact": "..."}},
        "dinner":    {{"name": "Restaurant name","why": "...",           "fact": "..."}},
        "sights": [
          {{"name": "Place name", "why": "Why this place fits here.", "fact": "Surprising fact about it."}},
          {{"name": "Another place", "why": "...", "fact": "..."}}
        ]
      }}
    ]
    """

    # Try gemini-flash-latest first — alias for the current stable
    # version, more reliable than the pinned -2.5-flash which can
    # 503 (UNAVAILABLE) during demand spikes. Pinned version is the
    # fallback for when -latest itself rolls a bad change.
    models = ["gemini-flash-latest", "gemini-2.5-flash"]
    result_text = None
    last_error = None

    # Nested loop: outer = key rotation, inner = model fallback.
    #
    # For each candidate key we try every model in order. On a quota
    # error we mark the slot cooled (BYO slot 0 is exempt — that key
    # isn't ours to track) and skip to the next key without burning
    # latency on the other models. On any other error we still try
    # the next model on the same key, then fall through to the next
    # key after exhausting model options.
    for slot, api_key in keys_to_try:
        for model in models:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                headers = {"Content-Type": "application/json"}
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.7,
                        "responseMimeType": "application/json",
                    },
                }

                # 2026-05-20: `with` ensures the socket is released on
                # exit so Gemini's long generations don't pile up FDs.
                with requests.post(url, headers=headers, json=payload, timeout=30) as resp:
                    # Capture Google's error body before raising — a bare HTTPError
                    # message ("503 Server Error") hides the actual reason.
                    if not resp.ok:
                        try:
                            err_body = resp.json().get("error", {})
                            raise RuntimeError(f"{err_body.get('status', resp.status_code)}: {err_body.get('message', resp.text[:200])}")
                        except ValueError:
                            raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")

                    result = resp.json()
                result_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
                if result_text:
                    break
            except Exception as e:
                last_error = str(e)
                # Quota / rate-limit errors → the key is cooked for
                # the day. Mark it (unless BYO) and bail out of the
                # model loop — the other model on the same key will
                # hit the same quota wall.
                if _looks_like_quota_error(last_error):
                    if slot != 0:
                        _mark_key_exhausted(slot)
                    logger.warning(
                        "Gemini slot %d quota hit on model %s: %s",
                        slot, model, e,
                    )
                    break
                logger.warning(f"Gemini model {model} on slot {slot} failed: {e}")
                continue
        if result_text:
            break

    if not result_text:
        # If every host slot is now cooled the user can't recover
        # without bringing their own key — return 429 so the frontend
        # can surface the BYO panel. Otherwise it's a transient 502.
        host_status = _pool_status()
        was_quota = (
            host_status["total"] > 0
            and host_status["available"] == 0
        )
        return jsonify({
            "error": (
                "Today's shared AI quota is fully booked. Add your own "
                "Gemini API key (free for personal use) to keep generating."
                if was_quota
                else f"AI generation failed. Last error: {last_error}"
            ),
            "host_keys": host_status,
        }), (429 if was_quota else 502)

    raw_text = result_text.strip()
    if raw_text.startswith("```json"):
        raw_text = raw_text[7:]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]

    try:
        itinerary = json.loads(raw_text.strip())
        # Phase G slice 1 — Maps verification + enrichment. Items go
        # from strings to objects with placeId / photoUrl / rating /
        # address / mapsUrl when the lookup hits, or `verified: false`
        # when the LLM made it up. No-op when GOOGLE_MAPS_API_KEY
        # isn't set — items stay as strings.
        itinerary = _enrich_itinerary(itinerary, destination)
        # Include the pool snapshot on success too so the frontend
        # bar refreshes after every generation — useful when one
        # request silently drains the last available slot.
        return jsonify({
            "status": "success",
            "itinerary": itinerary,
            "host_keys": _pool_status(),
        })
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return jsonify({"error": str(e)}), 500
