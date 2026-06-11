#!/usr/bin/env python3
"""Boot the REAL app on a given port with an isolated, richly-seeded DB so a
persona agent can use the live product end-to-end. Non-destructive (temp DB
per port). Stays alive until killed.

Usage:  python3 scratch/audit_mk2/serve_persona.py <PORT>
        (default port 5101; DB at /tmp/gg_persona_<PORT>.db)

Seeds two friends (test-user-1 "Alex", test-user-2 "Sara") with a rich Lisbon
trip (days, marked places, checklist, multi-currency expenses, budgets,
settlement), a 2nd Tokyo trip, Sara's public Bali trip, a friendship, feed
shares + a like/comment. GG_ALLOW_TEST_LOGIN=1 so the browser can log in via
POST /api/auth/google {token:"test:test-user-1"} (no Google needed).
"""
import os
import sys
import threading
import time
import uuid

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5101
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = f"/tmp/gg_persona_{PORT}.db"
if os.path.exists(DB):
    os.remove(DB)
os.environ.update(
    GG_DB_PATH=DB, GG_ALLOW_TEST_LOGIN="1", GG_E2E="1",
    GG_JWT_SECRET="persona-audit-secret-" + "0" * 24,
    GG_UPLOAD_ROOT=f"/tmp/gg_persona_{PORT}_uploads",
)
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))

import requests
from werkzeug.serving import make_server
from database import init_db

init_db()
import main

BASE = f"http://127.0.0.1:{PORT}"


def client(uid, name):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/google", json={"token": f"test:{uid}", "name": name})
    r.raise_for_status()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    s.headers["Origin"] = BASE
    return s


def seed():
    alex = client("test-user-1", "Alex Rivera")
    sara = client("test-user-2", "Sara Lopez")
    alex.post(f"{BASE}/api/profile/update", json={"bio": "Always planning the next escape", "status": "Lisbon to Tokyo", "homeCurrency": "EUR", "homeCountry": "ES"})
    sara.post(f"{BASE}/api/profile/update", json={"bio": "Sun, sea, and spreadsheets.", "homeCurrency": "EUR"})

    t1 = "trip-lisbon"
    alex.post(f"{BASE}/api/trips", json={"trip": {
        "id": t1, "name": "Lisbon Getaway", "country": "Portugal", "countryCode": "PT",
        "isPublic": True, "companions": [{"name": "Sara"}, {"name": "Tom"}], "countries": ["PT", "ES"],
    }})
    days = [
        ("Arrival & Alfama", "Land at LIS, drop bags", "Wander Alfama's alleys", "Fado dinner @ Clube de Fado", "Buy a 24h Metro pass"),
        ("Belem & Monuments", "Jeronimos Monastery", "Pasteis de Belem (get 6)", "Sunset at MAAT", "Book Belem Tower slot online"),
        ("Sintra Day Trip", "Train to Sintra", "Pena Palace + Quinta da Regaleira", "Dinner back in Bairro Alto", "Wear comfy shoes"),
        ("Markets & Departure", "Time Out Market brunch", "LX Factory shopping", "Flight home", "Keep EUR20 for the airport taxi"),
    ]
    for n, (nm, mo, af, ev, tip) in enumerate(days):
        alex.post(f"{BASE}/api/days", json={"day": {
            "id": f"day-lisbon-{n}", "tripId": t1, "dayNumber": n,
            "name": nm, "morning": mo, "afternoon": af, "evening": ev, "tip": tip,
        }})
    alex.post(f"{BASE}/api/trips/{t1}/media", json={
        "markedPlaces": [
            {"name": "Belem Tower", "lat": 38.6916, "lng": -9.2160, "note": "Iconic"},
            {"name": "Time Out Market", "lat": 38.7071, "lng": -9.1459, "note": "Lunch"},
            {"name": "Miradouro da Senhora do Monte", "lat": 38.7186, "lng": -9.1316, "note": "Best view"},
        ],
        "checklist": [
            {"text": "Renew passport", "done": True},
            {"text": "Book Sintra tickets", "done": True},
            {"text": "Exchange EUR200 cash", "done": False},
            {"text": "Download offline map", "done": False},
        ],
    })
    expenses = [
        ("TAP flights LIS", "flights", 312.40, "EUR"),
        ("Hotel Baixa (3 nights)", "accommodation", 415.00, "EUR"),
        ("Pasteis de Belem", "food", 9.60, "EUR"),
        ("Fado dinner", "food", 84.00, "EUR"),
        ("Sintra train + palaces", "transport", 53.20, "EUR"),
        ("Souvenirs (tiles)", "shopping", 47.00, "EUR"),
        ("Airport taxi", "transport", 18.50, "EUR"),
        ("Rooftop drinks", "food", 36.00, "USD"),
    ]
    for label, cat, val, cur in expenses:
        alex.post(f"{BASE}/api/expenses", json={"expense": {
            "id": "exp-" + uuid.uuid4().hex[:10], "tripId": t1, "label": label,
            "categoryId": cat, "value": val, "currency": cur, "who": "Alex",
            "date": "2026-06-1" + str((hash(label) % 4) + 1),
            "splits": {"Alex": 50, "Sara": 50},
        }})
    for label, cat, amt in [("Total trip budget", None, 1200.0), ("Food", "food", 250.0)]:
        b = {"id": "bud-" + uuid.uuid4().hex[:8], "tripId": t1, "amount": amt, "currency": "EUR", "label": label}
        if cat:
            b["categoryId"] = cat
        alex.post(f"{BASE}/api/budgets", json={"budget": b})

    t2 = "trip-tokyo"
    alex.post(f"{BASE}/api/trips", json={"trip": {
        "id": t2, "name": "Tokyo Adventure", "country": "Japan", "countryCode": "JP",
        "isPublic": False, "companions": [{"name": "Tom"}],
    }})
    for n, nm in enumerate(["Shibuya & Harajuku", "Day trip to Hakone", "Senso-ji & Akihabara"]):
        alex.post(f"{BASE}/api/days", json={"day": {"id": f"day-tokyo-{n}", "tripId": t2, "dayNumber": n, "name": nm}})
    alex.post(f"{BASE}/api/expenses", json={"expense": {"id": "exp-" + uuid.uuid4().hex[:10], "tripId": t2, "label": "JR Pass", "categoryId": "transport", "value": 28000, "currency": "JPY", "who": "Alex", "date": "2026-09-02"}})

    alex.post(f"{BASE}/api/friends/add", json={"friend_id": "test-user-2"})
    sara.post(f"{BASE}/api/friends/accept", json={"friend_id": "test-user-1"})
    st = "trip-bali"
    sara.post(f"{BASE}/api/trips", json={"trip": {"id": st, "name": "Bali Escape", "country": "Indonesia", "countryCode": "ID", "isPublic": True}})
    for n, nm in enumerate(["Ubud rice terraces", "Uluwatu temple sunset"]):
        sara.post(f"{BASE}/api/days", json={"day": {"id": f"day-bali-{n}", "tripId": st, "dayNumber": n, "name": nm}})
    sara.post(f"{BASE}/api/feed/share", json={"trip_id": st, "caption": "Paradise found - who's joining next time?"})
    alex.post(f"{BASE}/api/feed/share", json={"trip_id": t1, "caption": "Counting down to Lisbon!"})

    alex.post(f"{BASE}/api/trips/invite", json={"trip_id": t1, "target_user_id": "test-user-2", "role": "planner"})
    sara.post(f"{BASE}/api/trips/invite/respond", json={"trip_id": t1, "accept": True})
    alex.post(f"{BASE}/api/settlements", json={"tripId": t1, "fromUserId": "test-user-2", "toUserId": "test-user-1", "amount": 45.0, "currency": "EUR", "method": "revolut"})

    feed = alex.get(f"{BASE}/api/feed").json()
    for e in (feed if isinstance(feed, list) else []):
        if e.get("type") == "friend_shared_trip" and isinstance(e.get("trip"), dict) and e["trip"].get("id") == t1:
            eid = e["id"]
            sara.post(f"{BASE}/api/feed/like/{eid}")
            sara.post(f"{BASE}/api/feed/comment/{eid}", json={"body": "So jealous! Have the pasteis for me."})
            break
    print("SEEDED OK", flush=True)


server = make_server("127.0.0.1", PORT, main.app, threaded=True)
threading.Thread(target=server.serve_forever, daemon=True).start()
time.sleep(0.8)
try:
    seed()
except Exception as e:
    import traceback
    print("SEED ERROR:", e)
    traceback.print_exc()
print(f"READY on {BASE}", flush=True)
while True:
    time.sleep(3600)
