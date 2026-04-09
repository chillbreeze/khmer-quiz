import os
import random
import secrets
import psycopg2
import psycopg2.extras
from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from functools import wraps
import uuid

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "")


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return redirect(url_for("login", next=request.path))
        return f(*args, **kwargs)
    return decorated

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


# ── Quiz routes ────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/question")
def question():
    """Return a random vocab item and (for choice mode) 3 wrong answers."""
    mode      = request.args.get("mode", "choice")   # 'type' | 'choice'
    direction = request.args.get("direction", "random")  # 'en_to_km' | 'km_to_en' | 'random'

    if direction == "random":
        direction = random.choice(["en_to_km", "km_to_en"])

    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Pick one random active word
    cur.execute("SELECT id, english, khmer FROM vocab WHERE active = TRUE ORDER BY RANDOM() LIMIT 1")
    item = cur.fetchone()
    if not item:
        conn.close()
        return jsonify({"error": "No vocab in database"}), 404

    prompt  = item["english"] if direction == "en_to_km" else item["khmer"]
    answer  = item["khmer"]   if direction == "en_to_km" else item["english"]

    payload = {
        "id":        item["id"],
        "direction": direction,
        "prompt":    prompt,
        "answer":    answer,  # only used in 'type' mode; omitted for choice mode below
    }

    if mode == "choice":
        # Fetch 3 wrong answers from the same column
        answer_col = "khmer" if direction == "en_to_km" else "english"
        cur.execute(
            f"SELECT {answer_col} AS wrong FROM vocab WHERE id != %s AND active = TRUE ORDER BY RANDOM() LIMIT 3",
            (item["id"],)
        )
        wrongs  = [r["wrong"] for r in cur.fetchall()]
        choices = wrongs + [answer]
        random.shuffle(choices)
        payload["choices"] = choices
        del payload["answer"]  # don't leak answer in choice mode
        # Store correct answer server-side in session so we can validate
        session["correct"] = answer
        session["vocab_id"] = item["id"]
        session["direction"] = direction
    else:
        # Type mode: answer is sent client-side for immediate feedback
        # (acceptable for a personal/learning tool — no auth yet)
        pass

    conn.close()
    return jsonify(payload)


@app.route("/api/check", methods=["POST"])
def check():
    """Validate a multiple-choice answer and record the result."""
    data      = request.get_json()
    chosen    = (data.get("chosen") or "").strip()
    session_id = session.get("session_id") or str(uuid.uuid4())
    session["session_id"] = session_id

    correct_answer = session.get("correct", "")
    vocab_id       = session.get("vocab_id")
    direction      = session.get("direction", "random")

    is_correct = chosen.strip().lower() == correct_answer.strip().lower()

    # Record result
    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute(
            "INSERT INTO quiz_results (session_id, vocab_id, direction, mode, correct) VALUES (%s, %s, %s, %s, %s)",
            (session_id, vocab_id, direction, "choice", is_correct)
        )
        conn.close()
    except Exception:
        pass  # non-fatal; stats are a bonus

    return jsonify({"correct": is_correct, "answer": correct_answer})


@app.route("/api/check_typed", methods=["POST"])
def check_typed():
    """Validate a typed answer (fuzzy: strip + lowercase)."""
    data       = request.get_json()
    typed      = (data.get("typed") or "").strip().lower()
    correct    = (data.get("answer") or "").strip().lower()
    vocab_id   = data.get("vocab_id")
    direction  = data.get("direction", "random")
    session_id = session.get("session_id") or str(uuid.uuid4())
    session["session_id"] = session_id

    is_correct = typed == correct

    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute(
            "INSERT INTO quiz_results (session_id, vocab_id, direction, mode, correct) VALUES (%s, %s, %s, %s, %s)",
            (session_id, vocab_id, direction, "type", is_correct)
        )
        conn.close()
    except Exception:
        pass

    return jsonify({"correct": is_correct, "answer": correct})


# ── Auth routes ───────────────────────────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        username_ok = ADMIN_USERNAME and secrets.compare_digest(username, ADMIN_USERNAME)
        password_ok = ADMIN_PASSWORD and secrets.compare_digest(password, ADMIN_PASSWORD)
        if username_ok and password_ok:
            session["admin_logged_in"] = True
            next_url = request.args.get("next") or url_for("admin")
            return redirect(next_url)
        return render_template("login.html", error="Incorrect username or password.")
    return render_template("login.html", error=None)


@app.route("/logout")
def logout():
    session.pop("admin_logged_in", None)
    return redirect(url_for("index"))


# ── Admin routes ──────────────────────────────────────────────────────────────

@app.route("/admin")
@login_required
def admin():
    return render_template("admin.html")


@app.route("/api/vocab")
def vocab_list():
    conn = get_db()
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, english, khmer, notes, category, active FROM vocab ORDER BY id")
    rows = cur.fetchall()
    conn.close()
    resp = jsonify(list(rows))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.route("/api/vocab", methods=["POST"])
@login_required
def vocab_add():
    data = request.get_json()
    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        "INSERT INTO vocab (english, khmer, notes, category) VALUES (%s, %s, %s, %s) RETURNING id",
        (data["english"], data["khmer"], data.get("notes", ""), data.get("category", "general"))
    )
    new_id = cur.fetchone()[0]
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/vocab/<int:vocab_id>", methods=["PUT"])
@login_required
def vocab_update(vocab_id):
    data = request.get_json()
    conn = get_db()
    cur  = conn.cursor()
    cur.execute(
        "UPDATE vocab SET english=%s, khmer=%s, notes=%s, category=%s, active=%s, updated_at=NOW() WHERE id=%s",
        (data["english"], data["khmer"], data.get("notes", ""), data.get("category", "general"), data.get("active", True), vocab_id)
    )
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/vocab/<int:vocab_id>", methods=["DELETE"])
@login_required
def vocab_delete(vocab_id):
    conn = get_db()
    cur  = conn.cursor()
    cur.execute("DELETE FROM vocab WHERE id=%s", (vocab_id,))
    conn.close()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")
