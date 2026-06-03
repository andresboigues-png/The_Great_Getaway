"""GG API tests — Gemini itinerary generation, Places photo proxy, FX rates, AI usage cap.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


import json
import sys


def test_generate_itinerary_rejects_missing_key(client, seed_user, auth_headers, monkeypatch):
    """No BYO key + every host-pool slot empty → 429 with a "shared AI
    quota fully booked" message pointing the user at BYO. The 6-slot
    host-key pool added 2026-05-17 rotates through GEMINI_API_KEY plus
    GEMINI_API_KEY_2..6, so the test must clear ALL of them (an env that
    has even one slot set would silently fall through to that key and
    return 200). Pre-rotation this was a 400; post-rotation the
    `_available_host_keys` path returns 429 when the pool is empty."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    for slot in range(2, 7):
        monkeypatch.delenv(f"GEMINI_API_KEY_{slot}", raising=False)
    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Tokyo",
        "numDays": 3,
    })
    assert res.status_code == 429
    body = res.get_json()
    assert "fully booked" in body["error"]


class _FakeGeminiResponse:
    """Stand-in for requests.Response. Models the slice of the API the
    handler reads (status_code, ok, json(), text).

    Context-manager protocol added 2026-05-27: the prod path in
    routes/integrations.py wraps the response in `with requests.post(...)
    as resp:` (FD-leak fix cbb2e3a). Without __enter__/__exit__ here,
    every Gemini test crashes at the `with` line with
    "object does not support the context manager protocol"."""

    def __init__(self, status_code: int, json_body=None, text: str = ""):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._json_body = json_body
        self.text = text

    def json(self):
        if self._json_body is None:
            raise ValueError("not JSON")
        return self._json_body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_generate_itinerary_happy_path(client, seed_user, auth_headers, monkeypatch):
    """Mock a successful Gemini response → handler unwraps the
    candidates[].content.parts[].text shape and returns the parsed
    itinerary array. Pin the wire shape because a Gemini API change
    that drops or renames any of those fields would silently break.

    Phase G slice 1: explicitly delenv BOTH GOOGLE_MAPS_API_KEY and
    GOOGLE_MAPS_SERVER_KEY so the Places verification path short-
    circuits — this test pins the Gemini pass-through, the verification
    path has its own dedicated tests below. The handler prefers the
    `_SERVER_KEY` slot, so clearing only `_API_KEY` (the pre-split var
    name) leaves the verification path live and flips items from
    strings to objects, breaking the assertion below."""
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    fake_itinerary = [
        {
            "day": 1, "date": "2026-04-15", "title": "Arrival",
            "mainLocation": "Shibuya",
            "morning": {"activity": "Coffee", "items": ["Blue Bottle"]},
            "afternoon": {"activity": "Walk", "items": ["Yoyogi Park"]},
            "evening": {"activity": "Dinner", "items": ["Ramen alley"]},
        },
    ]
    fake_resp_body = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(fake_itinerary)}]}},
        ],
    }

    def fake_post(url, headers=None, json=None, timeout=None, **kwargs):
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Tokyo", "numDays": 1, "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["itinerary"] == fake_itinerary


def test_generate_itinerary_strips_markdown_fences(
    client, seed_user, auth_headers, monkeypatch,
):
    """Some Gemini responses wrap the JSON in ```json ... ``` despite
    responseMimeType:application/json — the handler strips those
    fences before parsing. Pin the strip so a Gemini behaviour change
    that re-introduces them doesn't crash json.loads."""
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    fake_itinerary = [{"day": 1, "title": "Arrival"}]
    wrapped_text = f"```json\n{json.dumps(fake_itinerary)}\n```"
    fake_resp_body = {
        "candidates": [
            {"content": {"parts": [{"text": wrapped_text}]}},
        ],
    }

    def fake_post(url, headers=None, json=None, timeout=None, **kwargs):
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Lisbon", "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["itinerary"] == fake_itinerary


def test_generate_itinerary_502_when_both_models_fail(
    client, seed_user, auth_headers, monkeypatch,
):
    """Handler tries gemini-flash-latest then gemini-2.5-flash. Both
    failing → 502 with last_error. Pin the retry-then-bail sequence
    so a future single-model regression doesn't silently degrade."""
    call_log = []

    def fake_post(url, headers=None, json=None, timeout=None, **kwargs):
        call_log.append(url)
        # Return a 503 with Google's standard error envelope so the
        # handler's err_body extraction path runs.
        return _FakeGeminiResponse(
            503,
            json_body={"error": {"status": "UNAVAILABLE", "message": "Service overloaded"}},
        )

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    # R6-B1: BYO key must match Google's AIzaSy + 33-char shape, else
    # the route falls through to the host pool (per-IP limit + per-user
    # 20/day on the host pool). Use a properly-shaped placeholder so
    # the BYO single-key path runs (2 model calls, no pool walk).
    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Lisbon",
        "gemini_key": "AIzaSy" + "A" * 33,
    })
    assert res.status_code == 502
    body = res.get_json()
    # R3-Round 3 fix: user-facing error is now a friendly one-liner
    # (no Google internal codes). The raw "UNAVAILABLE" / response
    # text lands in the server log only.
    assert "AI generation failed" in body["error"]
    assert "UNAVAILABLE" not in body["error"], \
        "Google's raw error status should not appear in user-facing message"
    # Confirm both models were attempted before bailing.
    assert len(call_log) == 2
    assert "gemini-flash-latest" in call_log[0]
    assert "gemini-2.5-flash" in call_log[1]


def test_generate_itinerary_places_verification_enriches_items(
    client, seed_user, auth_headers, monkeypatch,
):
    """Phase G slice 1: with GOOGLE_MAPS_API_KEY set, every itinerary
    item gets resolved via Places API Text Search and rewritten from
    a string to an enriched object with placeId / photoUrl / rating /
    address / mapsUrl on a hit, or `verified: false` on a miss.

    This pin protects three guarantees the frontend renderer relies on:
      1. Verified items carry a placeId (the unique-identity hook)
      2. Photo URL points at the Places API NEW media endpoint
      3. Items the LLM hallucinated (Places returns no result) come
         back as `verified: false` so the UI can flag them

    The handler prefers GOOGLE_MAPS_SERVER_KEY over the legacy
    GOOGLE_MAPS_API_KEY (post-2026-05-17 key split — see
    `_verify_place` for the resolution order). A dev's .env that has
    the real `_SERVER_KEY` set would hit the actual Places API and
    bypass the fake_post mock — clear it first, then set the fake key
    via the legacy `_API_KEY` slot the test still uses."""
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "fake-maps-key")

    fake_itinerary = [{
        "day": 1, "date": "2026-04-15", "title": "Arrival",
        "morning": {
            "activity": "Coffee",
            "items": [
                {"name": "Sagrada Familia", "why": "Iconic Gaudí basilica.", "fact": "Construction started in 1882."},
                {"name": "Made-up Place That Doesn't Exist 9999", "why": "Why field.", "fact": "Fact field."},
            ],
        },
        "afternoon": {
            "activity": "Walk",
            "items": [
                {"name": "Park Güell", "why": "Hilltop mosaics.", "fact": "Originally designed as a housing project."},
            ],
        },
        "evening": {"activity": "Dinner", "items": []},
    }]
    # Precompute the Gemini response body BEFORE defining fake_post —
    # inside the function `json` is the request-body parameter (because
    # requests.post is called with `json=...`), which shadows the json
    # module. Building the body here lets us reference json.dumps
    # without aliasing the module.
    gemini_response_body = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(fake_itinerary)}]}}],
    }

    def fake_post(url, headers=None, json=None, timeout=None, **kwargs):
        # Distinguish Gemini calls from Places calls by URL.
        if "generativelanguage.googleapis.com" in url:
            return _FakeGeminiResponse(200, json_body=gemini_response_body)
        if "places.googleapis.com" in url:
            # Read the textQuery to decide hit-vs-miss. The handler
            # builds it as `<item> in <destination>`. Real-place names
            # get a hit; the obviously-fake item gets a miss (empty
            # places array, the Places API contract for "no match").
            text_query = (json or {}).get("textQuery", "")
            if "Made-up Place" in text_query:
                return _FakeGeminiResponse(200, json_body={"places": []})
            return _FakeGeminiResponse(200, json_body={
                "places": [{
                    "id": f"ChIJ-{abs(hash(text_query)) % 100000}",
                    "displayName": {"text": text_query.split(" in ")[0]},
                    "formattedAddress": "Some real address, Barcelona, Spain",
                    "location": {"latitude": 41.4036, "longitude": 2.1744},
                    "rating": 4.7,
                    "userRatingCount": 12345,
                    "googleMapsUri": "https://maps.app.goo.gl/fakeshort",
                    "photos": [{"name": "places/fakeplace/photos/fakephoto"}],
                }],
            })
        return _FakeGeminiResponse(404)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Barcelona", "numDays": 1, "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    body = res.get_json()
    morning_items = body["itinerary"][0]["morning"]["items"]
    afternoon_items = body["itinerary"][0]["afternoon"]["items"]
    # Sagrada Familia hit — verified, enriched.
    assert morning_items[0]["text"] == "Sagrada Familia"
    assert morning_items[0]["verified"] is True
    assert morning_items[0]["placeId"].startswith("ChIJ-")
    assert morning_items[0]["rating"] == 4.7
    assert morning_items[0]["address"] == "Some real address, Barcelona, Spain"
    # R2 audit fix: photoUrl is now a same-origin proxy URL, NEVER an
    # absolute Google URL with the server key embedded. The proxy
    # injects the key server-side at request time. Anyone inspecting
    # the AI response can no longer harvest the Maps server key.
    assert morning_items[0]["photoUrl"].startswith("/api/places/photo/")
    assert "fake-maps-key" not in morning_items[0]["photoUrl"], \
        "Maps key MUST NOT appear in the response body"
    assert "googleapis.com" not in morning_items[0]["photoUrl"], \
        "photoUrl should be same-origin (proxy), not Google's CDN"
    # Phase G slice 2 — lat/lng plumbed through so the home map can
    # render to-do markers for AI-suggested places without a separate
    # Place Details fetch.
    assert morning_items[0]["lat"] == 41.4036
    assert morning_items[0]["lng"] == 2.1744
    # Phase G v3 — why/fact context preserved through verification.
    assert morning_items[0]["why"] == "Iconic Gaudí basilica."
    assert morning_items[0]["fact"] == "Construction started in 1882."
    # Hallucination — unverified, no Maps enrichment fields, but the
    # why/fact context still survives so the user can see what the LLM
    # was reaching for.
    assert morning_items[1]["text"].startswith("Made-up Place")
    assert morning_items[1]["verified"] is False
    assert "placeId" not in morning_items[1]
    assert morning_items[1]["why"] == "Why field."
    # Afternoon item is also verified via the cache (same fake-post path).
    assert afternoon_items[0]["verified"] is True


def test_generate_itinerary_places_verification_skipped_without_key(
    client, seed_user, auth_headers, monkeypatch,
):
    """Phase G slice 1: BOTH Maps key slots missing → verification path
    short-circuits, items pass through as strings unchanged. Critical
    for dev / self-hosted deploys that don't have a Maps API key — we
    don't want a 500 or a behavior change just because the key isn't
    there. Post-2026-05-17 the handler checks `GOOGLE_MAPS_SERVER_KEY`
    first then falls back to `GOOGLE_MAPS_API_KEY`, so we need to clear
    both for the no-op path to be exercised. Pin the no-op so a
    regression that hard-requires the key fails CI before it lands."""
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    fake_itinerary = [{
        "day": 1, "title": "Arrival",
        "morning": {"activity": "Coffee", "items": ["Some Cafe", "Another Place"]},
        "afternoon": {"activity": "Walk", "items": []},
        "evening": {"activity": "Dinner", "items": []},
    }]
    # Precompute outside fake_post — `json` is shadowed by the request-
    # body parameter inside the function.
    fake_resp_body = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(fake_itinerary)}]}}],
    }
    places_calls = []

    def fake_post(url, headers=None, json=None, timeout=None, **kwargs):
        if "places.googleapis.com" in url:
            places_calls.append(url)
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Tokyo", "numDays": 1, "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    # Wire shape: legacy string items pass through unchanged when the
    # Places-verification path is skipped (no GOOGLE_MAPS_API_KEY).
    # Pre-Phase-G itineraries cached on trip.aiPlan still have this
    # shape so the back-compat is critical.
    assert res.get_json()["itinerary"][0]["morning"]["items"] == ["Some Cafe", "Another Place"]
    # And we did NOT call Places API (no quota burned without a key).
    assert len(places_calls) == 0


def test_generate_itinerary_500_on_invalid_json_in_response(
    client, seed_user, auth_headers, monkeypatch,
):
    """If Gemini returns a 200 but the candidate text isn't valid JSON
    (rare but possible — the model can ignore the schema), handler
    catches the json.loads exception and returns 500 with the parse
    error. Pin so a regression that lets the exception bubble crash
    the dev server."""
    fake_resp_body = {
        "candidates": [
            {"content": {"parts": [{"text": "not actually json {{{"}]}},
        ],
    }

    def fake_post(url, headers=None, json=None, timeout=None, **kwargs):
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Paris", "gemini_key": "byo-key",
    })
    assert res.status_code == 500
    body = res.get_json()
    assert "error" in body


# ── R11-B6: AI per-user 20/day cap ──────────────────────────────────────
# /api/generate_itinerary runs from a 6-slot host Gemini key pool with a
# per-user daily cap (R6-B1). Pre-fix the cap had test coverage zero;
# regressing it would silently drain the shared pool for every user.

def test_generate_itinerary_429_when_per_user_cap_hit(
    client, seed_user, auth_headers, monkeypatch,
):
    """R6-B1 contract: once a user has used their 20/day allowance on
    the HOST pool, the next call returns 429 + `userCapHit: True`. The
    response body is what the frontend branches on (R10-B6b MA2) to
    show the BYO-key escape hatch instead of the generic quota toast."""
    from datetime import date
    # Use the new shared bucket directly so we don't depend on
    # integrations.py's private dict shape.
    import sys
    sys.path.insert(0, "src")
    import helpers
    helpers._USER_DAILY_BUCKETS.clear()
    # Also reach into integrations.py's own per-user counter — it's
    # the actual gate. Pre-set to the cap.
    from routes import integrations
    integrations._ai_user_counts[seed_user] = (20, date.today().toordinal())
    res = client.post(
        "/api/generate_itinerary",
        headers=auth_headers,
        json={
            "destination": "Lisbon",
            "numDays": 2,
            "dateFrom": "2026-06-01",
            "dateTo": "2026-06-02",
            "foodContext": "",
            "sightseeingContext": "",
        },
    )
    assert res.status_code == 429
    body = res.get_json()
    assert body.get("userCapHit") is True, (
        f"per-user cap response must set userCapHit:true; got {body!r}"
    )


def test_ai_count_resets_across_day_boundary(seed_user):
    """The per-user counter is keyed by date.toordinal() — yesterday's
    count is invisible today. Pin that contract so a refactor doesn't
    silently turn the cap into a lifetime quota."""
    from datetime import date
    import sys
    sys.path.insert(0, "src")
    from routes import integrations
    # Yesterday's entry should NOT count toward today.
    integrations._ai_user_counts[seed_user] = (
        integrations._AI_DAILY_CAP_PER_USER + 99,
        date.today().toordinal() - 1,
    )
    assert integrations._ai_count_for_user(seed_user) == 0, (
        "yesterday's count must reset to 0 on a new day"
    )


# ── R11-B6: Places photo proxy validation ───────────────────────────────
# /api/places/photo/<path:photo_name>. Three distinct 4xx/5xx branches
# the audit agent flagged as uncovered: malformed path 400, key unset
# 503, oversize dimensions clamped (still 200 from upstream's side or
# 502 from network failure).

def test_places_photo_400_on_malformed_path(client, seed_user, auth_headers):
    """The route expects `places/<id>/photos/<ref>` — exactly 4
    segments with the right anchors. Anything else → 400."""
    bad_paths = [
        "/api/places/photo/not-a-place-path",
        "/api/places/photo/wrong/segments/here",
        "/api/places/photo/photos/abc/places/def",  # right pieces, wrong order
    ]
    for path in bad_paths:
        res = client.get(path, headers=auth_headers)
        assert res.status_code == 400, (
            f"{path} should 400; got {res.status_code}"
        )


def test_places_photo_503_when_key_unset(
    client, seed_user, auth_headers, monkeypatch,
):
    """No GOOGLE_MAPS_SERVER_KEY or GOOGLE_MAPS_API_KEY in env → 503
    (service unavailable; the operator hasn't configured the proxy)."""
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    res = client.get(
        "/api/places/photo/places/p123/photos/r456",
        headers=auth_headers,
    )
    assert res.status_code == 503


def test_places_photo_400_on_non_numeric_dimensions(
    client, seed_user, auth_headers, monkeypatch,
):
    """`?w=abc` → 400. Pre-route int() raises ValueError that we
    catch + convert to a clean 400."""
    monkeypatch.setenv("GOOGLE_MAPS_SERVER_KEY", "fake-key-for-test")
    res = client.get(
        "/api/places/photo/places/p123/photos/r456?w=abc",
        headers=auth_headers,
    )
    assert res.status_code == 400


# ── R11-B6: /api/fx-rates HTTP contract ─────────────────────────────────
# Anonymous-readable, returns a {rates: {...}} envelope. The frontend
# overlay depends on this exact shape — pin it so a refactor doesn't
# silently change the response envelope.

def test_fx_rates_returns_rates_envelope(client):
    """Plain GET returns 200 + body with a `rates` dict + EUR=1.0
    (always present even on a cold cache because EUR is the reference
    currency, not fetched from upstream)."""
    res = client.get("/api/fx-rates")
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, dict)
    rates = body.get("rates")
    assert isinstance(rates, dict), (
        f"response must carry a `rates` dict; got {body!r}"
    )
    # EUR is the pivot — always present.
    assert "EUR" in rates
    assert rates["EUR"] == 1.0


def test_fx_rates_anonymous_allowed(client):
    """No Authorization header → still 200. The endpoint is
    deliberately anonymous (rates are not user-specific + the page-
    load critical path benefits from cacheable responses)."""
    res = client.get("/api/fx-rates")  # no headers
    assert res.status_code == 200
