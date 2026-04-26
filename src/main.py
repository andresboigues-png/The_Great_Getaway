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
            
            # Fetch bio and status
            cursor.execute("SELECT bio, status FROM users WHERE id = ?", (user_id,))
            user_row = cursor.fetchone()
            db_bio = user_row['bio'] if user_row else ""
            db_status = user_row['status'] if user_row else ""
            
            conn.commit()

        return jsonify({
            "status": "success",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "picture": picture,
                "bio": db_bio or "",
                "status": db_status or ""
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
    companions = data.get("groups", []) # Front-end calls them groups

    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    with get_db() as conn:
        cursor = conn.cursor()
        
        # Sync Trips
        for t in trips:
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=excluded.is_archived,
                    is_public=excluded.is_public
            ''', (t['id'], user_id, t['name'], t['country'], 1 if t.get('is_archived') else 0, 1 if t.get('isPublic') else 0))
        
        # Sync Archived Trips
        archived_trips = data.get("archived_trips", [])
        for t in archived_trips:
            cursor.execute('''
                INSERT INTO trips (id, user_id, name, country, is_archived, is_public)
                VALUES (?, ?, ?, ?, 1, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    country=excluded.country,
                    is_archived=1,
                    is_public=excluded.is_public
            ''', (t['id'], user_id, t['name'], t['country'], 1 if t.get('isPublic') else 0))
            
            # Also sync expenses inside archived trips if they exist
            if 'expenses' in t:
                for e in t['expenses']:
                    cursor.execute('''
                        INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                            who=excluded.who,
                            label=excluded.label,
                            value=excluded.value,
                            euro_value=excluded.euro_value
                    ''', (e['id'], t['id'], e['who'], e['categoryId'], e['label'], e['date'], e['country'], e['value'], e['currency'], e['euroValue']))
        
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

        # Sync Companions
        cursor.execute("DELETE FROM companions WHERE user_id = ?", (user_id,))
        for c in companions:
            cursor.execute('''
                INSERT INTO companions (user_id, name)
                VALUES (?, ?)
            ''', (user_id, c))

        # Sync Categories
        categories = data.get("categories", [])
        if categories:
            cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
            for cat in categories:
                cursor.execute('''
                    INSERT INTO categories (id, user_id, name, icon, color)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id, user_id) DO UPDATE SET
                        name=excluded.name, icon=excluded.icon, color=excluded.color
                ''', (cat['id'], user_id, cat['name'], cat.get('icon', ''), cat.get('color', '#007aff')))

        # Sync Budgets
        budgets = data.get("budgets", [])
        # Delete budgets not in current list
        budget_ids = [b['id'] for b in budgets if 'id' in b]
        if budget_ids:
            placeholders = ','.join(['?'] * len(budget_ids))
            cursor.execute(f"DELETE FROM budgets WHERE user_id = ? AND id NOT IN ({placeholders})", [user_id] + budget_ids)
        else:
            cursor.execute("DELETE FROM budgets WHERE user_id = ?", (user_id,))
        for b in budgets:
            cursor.execute('''
                INSERT INTO budgets (id, user_id, trip_id, label, amount, currency)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    label=excluded.label, amount=excluded.amount, currency=excluded.currency, trip_id=excluded.trip_id
            ''', (b['id'], user_id, b.get('tripId'), b.get('label', ''), b.get('amount', 0), b.get('currency', 'EUR')))

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

    # gemini-flash-latest is the safest fallback as it always points to the current stable version
    models = ["gemini-2.5-flash", "gemini-flash-latest"]
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
                    "responseMimeType": "application/json"
                }
            }
            
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            
            result = resp.json()
            result_text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[]")
            if result_text:
                break
        except Exception as e:
            last_error = str(e)
            print(f"Model {model} failed: {e}")
            continue

    if not result_text:
        return jsonify({"error": f"AI Generation failed after trying multiple models. Last error: {last_error}"}), 500

    raw_text = result_text
        
    # Clean up any potential markdown formatting
    raw_text = raw_text.strip()
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
    """Send a friend request."""
    user_id = request.json.get("user_id")
    friend_id = request.json.get("friend_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if they are already friends or have a pending request
        cursor.execute("SELECT status FROM friends WHERE user_id = ? AND friend_id = ?", (user_id, friend_id))
        row = cursor.fetchone()
        if row:
            return jsonify({"status": "error", "message": "Request already exists or already friends"}), 400

        # Insert pending request (user_id -> friend_id)
        cursor.execute("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')", (user_id, friend_id))
        
        # Get sender name
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        sender_name = cursor.fetchone()["name"]
        
        # Create notification for the target user
        msg = f"{sender_name} sent you a friend request."
        cursor.execute("INSERT INTO notifications (user_id, type, related_id, message) VALUES (?, 'friend_request', ?, ?)", 
                       (friend_id, user_id, msg))
        
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/friends/accept", methods=["POST"])
def accept_friend():
    """Accept a friend request."""
    user_id = request.json.get("user_id") # The person accepting
    friend_id = request.json.get("friend_id") # The person who sent it
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Update original request
        cursor.execute("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?", (friend_id, user_id))
        
        # Insert reciprocal friendship
        cursor.execute("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')", (user_id, friend_id))
        
        # Get acceptor name
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        acceptor_name = cursor.fetchone()["name"]
        
        # Create notification for the sender
        msg = f"{acceptor_name} accepted your friend request."
        cursor.execute("INSERT INTO notifications (user_id, type, related_id, message) VALUES (?, 'accepted_request', ?, ?)", 
                       (friend_id, user_id, msg))
        
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/friends/pending", methods=["GET"])
def pending_friends():
    """Get pending incoming friend requests for a user."""
    user_id = request.args.get("user_id")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT u.id, u.name, u.email, u.picture 
            FROM users u
            JOIN friends f ON u.id = f.user_id
            WHERE f.friend_id = ? AND f.status = 'pending'
        ''', (user_id,))
        requests = [dict(row) for row in cursor.fetchall()]
    return jsonify(requests)

@app.route("/api/notifications/list", methods=["GET"])
def list_notifications():
    """Get notifications for a user."""
    user_id = request.args.get("user_id")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, type, related_id, message, is_read, created_at 
            FROM notifications 
            WHERE user_id = ? 
            ORDER BY created_at DESC LIMIT 50
        ''', (user_id,))
        notifications = [dict(row) for row in cursor.fetchall()]
    return jsonify(notifications)

@app.route("/api/notifications/read", methods=["POST"])
def read_notifications():
    """Mark all notifications as read for a user."""
    user_id = request.json.get("user_id")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE notifications SET is_read = 1 WHERE user_id = ?", (user_id,))
        conn.commit()
    return jsonify({"status": "success"})

@app.route("/api/notifications/trip_public", methods=["POST"])
def notify_trip_public():
    """Notify friends that a user made a trip public."""
    user_id = request.json.get("user_id")
    trip_name = request.json.get("trip_name")
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Get user's name
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"status": "error", "message": "User not found"}), 404
        user_name = user_row["name"]
        
        # Find all accepted friends
        cursor.execute("SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted'", (user_id,))
        friends = cursor.fetchall()
        
        for friend in friends:
            friend_id = friend["friend_id"]
            msg = f"{user_name} completed their trip to {trip_name} and made it public!"
            cursor.execute("INSERT INTO notifications (user_id, type, related_id, message) VALUES (?, 'trip_public', ?, ?)", 
                           (friend_id, user_id, msg))
        
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

        # Get companions
        cursor.execute("SELECT name FROM companions WHERE user_id = ?", (user_id,))
        companions = [row['name'] for row in cursor.fetchall()]

        # Get categories
        cursor.execute("SELECT id, name, icon, color FROM categories WHERE user_id = ?", (user_id,))
        categories = [dict(row) for row in cursor.fetchall()]

        # Get budgets
        cursor.execute("SELECT id, trip_id, label, amount, currency FROM budgets WHERE user_id = ?", (user_id,))
        budgets_rows = cursor.fetchall()
        budgets = [{'id': r['id'], 'tripId': r['trip_id'], 'label': r['label'], 'amount': r['amount'], 'currency': r['currency']} for r in budgets_rows]

    return jsonify({
        "trips": trips, 
        "expenses": expenses,
        "groups": companions,
        "categories": categories,
        "budgets": budgets
    })

@app.route("/api/profile/update", methods=["POST"])
def update_profile():
    """Update user bio and status."""
    user_id = request.json.get("user_id")
    bio = request.json.get("bio")
    status = request.json.get("status")
    
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET bio = ?, status = ? WHERE id = ?", (bio, status, user_id))
        conn.commit()
    return jsonify({"status": "updated"})

def main():
    logger.info("Starting The Great Escape backend with Social support...")
    port = int(os.getenv("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)

@app.route("/api/user-data", methods=["DELETE"])
def delete_user_data():
    """Wipe all data for a user (factory reset)."""
    user_id = request.json.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses")
        cursor.execute("DELETE FROM trips")
        cursor.execute("DELETE FROM trip_collaborators")
        cursor.execute("DELETE FROM companions")
        cursor.execute("DELETE FROM categories")
        cursor.execute("DELETE FROM budgets")
        cursor.execute("DELETE FROM notifications")
        cursor.execute("DELETE FROM friends")
        cursor.execute("DELETE FROM users")
        conn.commit()
    return jsonify({"status": "wiped"})


if __name__ == "__main__":
    main()
