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

import requests
from flask import Blueprint, jsonify, request

from auth import require_auth


logger = logging.getLogger(__name__)
bp = Blueprint("integrations", __name__)


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
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,"
                "places.rating,places.userRatingCount,"
                "places.googleMapsUri,places.photos.name"
            ),
        }
        payload = {"textQuery": text_query, "maxResultCount": 1}
        resp = requests.post(url, headers=headers, json=payload, timeout=8)
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
        return {
            "placeId": p.get("id"),
            "verifiedName": (p.get("displayName") or {}).get("text"),
            "address": p.get("formattedAddress"),
            "rating": p.get("rating"),
            "userRatingsTotal": p.get("userRatingCount"),
            "mapsUrl": p.get("googleMapsUri"),
            "photoUrl": photo_url,
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

    No-op when GOOGLE_MAPS_API_KEY is unset — items stay as strings,
    frontend's renderSlotBody falls through to the legacy text-bullet
    rendering. Lets dev / self-hosted setups skip the Maps integration
    without breaking anything; verification is value-add, not structural.
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY") or ""
    if not api_key:
        return itinerary

    cache: dict[str, dict | None] = {}

    def resolve(item_text: str) -> dict | None:
        if item_text in cache:
            return cache[item_text]
        meta = _verify_place(item_text, destination, api_key)
        cache[item_text] = meta
        return meta

    for day in itinerary or []:
        if not isinstance(day, dict):
            continue
        for slot_name in ("morning", "afternoon", "evening"):
            slot = day.get(slot_name)
            if not isinstance(slot, dict):
                continue
            items = slot.get("items")
            if not isinstance(items, list):
                continue
            new_items = []
            for raw in items:
                # Defensive: Gemini sometimes returns nested objects
                # when prompt drift produces structured items. Coerce
                # anything non-string to its string form.
                text = raw if isinstance(raw, str) else str(raw or "")
                text = text.strip()
                if not text:
                    continue
                meta = resolve(text)
                if meta and meta.get("placeId"):
                    new_items.append({"text": text, "verified": True, **meta})
                else:
                    new_items.append({"text": text, "verified": False})
            slot["items"] = new_items
    return itinerary


@bp.route("/api/config", methods=["GET"])
def get_config():
    """Expose AI API keys and Google Client ID from environment."""
    return jsonify({
        "openai_key": os.getenv("OPENAI_API_KEY", ""),
        "gemini_key": os.getenv("GEMINI_API_KEY", ""),
        "google_client_id": os.getenv("CLIENT_ID_GOOGLE_AUTH", ""),
    })


@bp.route("/api/generate_itinerary", methods=["POST"])
@require_auth
def generate_itinerary():
    """Call Gemini API to generate a structured JSON itinerary.
    Auth gate (and the JWT origin requirement) prevents anonymous
    traffic from burning paid LLM quota."""
    data = request.json or {}
    destination = data.get("destination", "Unknown")
    num_days = data.get("numDays", 3)
    date_from = data.get("dateFrom", "")
    date_to = data.get("dateTo", "")
    context = data.get("context", "")

    # BYO key path: client sends its own Gemini key in the request body
    # so we don't burn the host's quota on friends/family rollouts. We
    # never persist this to disk — used for the API call only and then
    # discarded with the request lifecycle. Empty / missing falls back
    # to the env var so dev + self-hosted setups still work.
    user_key = (data.get("gemini_key") or "").strip()
    api_key = user_key or os.getenv("GEMINI_API_KEY") or ""
    if not api_key:
        return jsonify({"error": "Gemini API key required. Click the (i) on the AI Engine card to learn how to get one — it's free for personal use."}), 400

    prompt = f"""
    You are an expert travel planner. Create a detailed {num_days}-day itinerary for {destination} from {date_from} to {date_to}.
    Additional context: {context}

    CRITICAL INSTRUCTION: You MUST return ONLY valid JSON. Do not wrap the JSON in markdown blocks.

    For EACH day provide morning, afternoon, evening time slots with REAL specific place names in {destination}.
    Each slot has an `activity` (the headline) and an `items` array — 2 to 4 short, concrete action bullets the traveler will do (visit a place, try a dish, take a photo at a viewpoint, etc.). Each item should be a single phrase, not a paragraph.
    Also include a "mainLocation" field with the name of the most iconic place visited that day (used for map geocoding).

    Schema:
    [
      {{
        "day": 1,
        "date": "{date_from}",
        "title": "Day title",
        "mainLocation": "Specific place name",
        "morning": {{"activity": "headline", "items": ["bullet 1", "bullet 2", "bullet 3"]}},
        "afternoon": {{"activity": "headline", "items": ["bullet 1", "bullet 2", "bullet 3"]}},
        "evening": {{"activity": "headline", "items": ["bullet 1", "bullet 2", "bullet 3"]}}
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

            resp = requests.post(url, headers=headers, json=payload, timeout=30)
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
            logger.warning(f"Gemini model {model} failed: {e}")
            continue

    if not result_text:
        return jsonify({"error": f"AI generation failed. Last error: {last_error}"}), 502

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
        return jsonify({"status": "success", "itinerary": itinerary})
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return jsonify({"error": str(e)}), 500
