import os
import json
import logging
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from database import get_db, init_db

# Load environment variables
load_dotenv()

# Configure basic logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize Flask App
app = Flask(__name__, 
            template_folder="../frontend/templates",
            static_folder="../frontend/static")

# Ensure DB is initialized
init_db()

@app.route("/")
def home():
    """Serve the main Single Page Application (SPA) index file."""
    return render_template("index.html")

# --- Authentication ---

@app.route("/api/auth/google", methods=["POST"])
def google_auth():
    """Verify Google ID Token and manage user session."""
    token = request.json.get("token")
    client_id = os.getenv("CLIENT_ID_GOOGLE_AUTH")
    
    if not token or not client_id:
        return jsonify({"error": "Missing token or Client ID"}), 400

    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
        
        user_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo['name']
        picture = idinfo['picture']

        # Save or update user in DB
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (id, email, name, picture)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    picture=excluded.picture
            ''', (user_id, email, name, picture))
            conn.commit()

        return jsonify({
            "status": "success",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "picture": picture
            }
        })
    except ValueError as e:
        logger.error(f"Token verification failed: {e}")
        return jsonify({"error": "Invalid token"}), 401

# --- API Routes for Trips & Expenses ---

@app.route("/api/sync", methods=["POST"])
def sync_data():
    """Sync client-side STATE to the database for a logged-in user."""
    data = request.json
    user_id = data.get("user_id")
    trips = data.get("trips", [])
    expenses = data.get("expenses", [])

    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Sync Trips
        for t in trips:
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=excluded.is_archived
            ''', (t['id'], user_id, t['name'], t['country'], 1 if t.get('is_archived') else 0))
        
        # Sync Expenses
        for e in expenses:
            cursor.execute('''
                INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    who=excluded.who,
                    label=excluded.label,
                    value=excluded.value,
                    euro_value=excluded.euro_value
            ''', (e['id'], e['tripId'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue']))

        conn.commit()
    
    return jsonify({"status": "synced"})

@app.route("/api/config", methods=["GET"])
def get_config():
    """Expose AI API keys and Google Client ID from environment."""
    return jsonify({
        "openai_key": os.getenv("OPENAI_API_KEY", ""),
        "gemini_key": os.getenv("GEMINI_API_KEY", ""),
        "google_client_id": os.getenv("CLIENT_ID_GOOGLE_AUTH", "")
    })

@app.route("/api/generate_itinerary", methods=["POST"])
def generate_itinerary():
    """Call Gemini API to generate a structured JSON itinerary."""
    data = request.json
    destination = data.get("destination", "Unknown")
    num_days = data.get("numDays", 3)
    date_from = data.get("dateFrom", "")
    date_to = data.get("dateTo", "")
    context = data.get("context", "")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "Gemini API key not configured"}), 500

    prompt = f"""
    You are an expert travel planner. Create a detailed {num_days}-day itinerary for {destination} from {date_from} to {date_to}.
    Additional context: {context}

    CRITICAL INSTRUCTION: You MUST return ONLY valid JSON. Do not wrap the JSON in markdown blocks.
    For EACH day provide morning, afternoon, evening activities with REAL specific place names in {destination}, plus a practical tip.
    Also include a "mainLocation" field with the name of the most iconic place visited that day (used for map geocoding).

    Schema:
    [
      {{
        "day": 1,
        "date": "{date_from}",
        "title": "Day title",
        "mainLocation": "Specific place name",
        "morning": {{"activity": "name", "description": "details"}},
        "afternoon": {{"activity": "name", "description": "details"}},
        "evening": {{"activity": "name", "description": "details"}},
        "tip": "Practical tip"
      }}
    ]
    """

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
                "responseMimeType": "application/json"
            }
        }
        
        resp = requests.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        
        result = resp.json()
        raw_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
        
        # Clean up any potential markdown formatting
        raw_text = raw_text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
            
        itinerary = json.loads(raw_text.strip())
        return jsonify({"status": "success", "itinerary": itinerary})
    except Exception as e:
        logger.error(f"Gemini API Error: {e}")
        return jsonify({"error": str(e)}), 500

# --- Social Features ---

@app.route("/api/friends/search", methods=["GET"])
def search_friends():
    """Search for users by email."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, email, picture FROM users WHERE email LIKE ? LIMIT 5", (f"%{query}%",))
        users = [dict(row) for row in cursor.fetchall()]
    return jsonify(users)

@app.route("/api/friends/add", methods=["POST"])
def add_friend():
    """Send a friend request or add directly (simplified for now)."""
    user_id = request.json.get("user_id")
    friend_id = request.json.get("friend_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')", (user_id, friend_id))
        cursor.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')", (friend_id, user_id))
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/friends/list", methods=["GET"])
def list_friends():
    """Get the user's friend list."""
    user_id = request.args.get("user_id")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture 
            FROM users u
            JOIN friends f ON u.id = f.friend_id
            WHERE f.user_id = ? AND f.status = 'accepted'
        ''', (user_id,))
        friends = [dict(row) for row in cursor.fetchall()]
    return jsonify(friends)

@app.route("/api/trips/share", methods=["POST"])
def share_trip():
    """Share a trip with a friend."""
    trip_id = request.json.get("trip_id")
    friend_id = request.json.get("friend_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO trip_collaborators (trip_id, user_id) VALUES (?, ?)", (trip_id, friend_id))
        conn.commit()
    return jsonify({"status": "shared"})

@app.route("/api/data", methods=["GET"])
def get_data():
    """Fetch all data for a user, including shared trips."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"trips": [], "expenses": []})

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get owned trips + shared trips
        cursor.execute('''
            SELECT * FROM trips WHERE user_id = ? 
            UNION
            SELECT t.* FROM trips t JOIN trip_collaborators c ON t.id = c.trip_id WHERE c.user_id = ?
        ''', (user_id, user_id))
        trips = [dict(row) for row in cursor.fetchall()]
        
        # Get all expenses for these trips
        trip_ids = [t['id'] for t in trips]
        expenses = []
        if trip_ids:
            placeholders = ','.join(['?'] * len(trip_ids))
            
            cursor.execute(f"SELECT * FROM expenses WHERE trip_id IN ({placeholders})", trip_ids)
            expenses = [dict(row) for row in cursor.fetchall()]

    return jsonify({
        "trips": trips, 
        "expenses": expenses
    })

def main():
    logger.info("Starting The Great Escape backend with Social support...")
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
    
if __name__ == "__main__":
    main()
