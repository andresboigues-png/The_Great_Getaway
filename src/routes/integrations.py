"""External integrations — currently just the Gemini AI itinerary
generator. /api/config exposes the public Google client id used by
the frontend's GIS button.
"""

import json
import logging
import os

import requests
from flask import Blueprint, jsonify, request

from auth import require_auth


logger = logging.getLogger(__name__)
bp = Blueprint("integrations", __name__)


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
        return jsonify({"status": "success", "itinerary": itinerary})
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return jsonify({"error": str(e)}), 500
