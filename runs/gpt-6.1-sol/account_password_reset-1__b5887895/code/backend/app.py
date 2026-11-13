import hashlib
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
RESET_MESSAGE = "If the account exists, a reset link is on its way"


class ValidationError(Exception):
    pass


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=str(Path(os.environ.get("DATA_DIR", ROOT / "data")) / "accounts.sqlite3"),
        MAX_CONTENT_LENGTH=16 * 1024,
        PUBLIC_BASE_URL=os.environ.get("PUBLIC_BASE_URL", ""),
    )
    if test_config:
        app.config.update(test_config)

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(app.config["DATABASE"])) as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                email TEXT,
                email_key TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS password_resets (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient TEXT NOT NULL,
                recipient_key TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                sent_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS outbox_recipient ON outbox(recipient_key, id DESC);
        """)

    def db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=15)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    def payload():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValidationError("Please send a JSON object.")
        return value

    def password(value):
        if not isinstance(value, str) or not 8 <= len(value) <= 1024:
            raise ValidationError("Your password must contain between 8 and 1,024 characters.")
        return value

    def email(value):
        if value is None or value == "":
            return None
        if not isinstance(value, str):
            raise ValidationError("Please enter a valid email address.")
        value = value.strip()
        if not value:
            return None
        if len(value) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValidationError("Please enter a valid email address.")
        return value

    def digest(token):
        return hashlib.sha256(token.encode()).hexdigest()

    def public_account(account):
        return {key: account[key] for key in ("id", "username", "email")}

    def authenticated(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get("Authorization", "").split()
            if len(authorization) != 2 or authorization[0].lower() != "bearer":
                return {"error": "Please sign in to continue."}, 401
            g.session_hash = digest(authorization[1])
            g.account = db().execute(
                "SELECT accounts.* FROM accounts JOIN sessions ON accounts.id = sessions.account_id "
                "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
                (g.session_hash, time.time()),
            ).fetchone()
            if g.account is None:
                return {"error": "Your session has expired. Please sign in again."}, 401
            return view(*args, **kwargs)

        return wrapped

    @app.errorhandler(ValidationError)
    def validation_error(error):
        return {"error": str(error)}, 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api/"):
            return jsonify(error=error.description), error.code
        return error

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        data = payload()
        username = data.get("username")
        if not isinstance(username, str) or not 1 <= len(username.strip()) <= 80:
            raise ValidationError("Choose a username between 1 and 80 characters.")
        username = username.strip()
        password_hash = generate_password_hash(password(data.get("password")))
        address = email(data.get("email"))
        try:
            with db():
                cursor = db().execute(
                    "INSERT INTO accounts (username, password_hash, email, email_key) VALUES (?, ?, ?, ?)",
                    (username, password_hash, address, address.casefold() if address else None),
                )
        except sqlite3.IntegrityError:
            return {"error": "That username or email address is already in use."}, 409
        return {"id": cursor.lastrowid, "username": username, "email": address}, 201

    @app.post("/api/auth/login")
    def login():
        data = payload()
        username, supplied_password = data.get("username"), data.get("password")
        if not isinstance(username, str) or not isinstance(supplied_password, str):
            raise ValidationError("Enter your username and password.")
        if len(supplied_password) > 1024:
            return {"error": "The username or password is incorrect."}, 401
        account = db().execute("SELECT * FROM accounts WHERE username = ?", (username.strip(),)).fetchone()
        if account is None or not check_password_hash(account["password_hash"], supplied_password):
            return {"error": "The username or password is incorrect."}, 401
        token = secrets.token_urlsafe(32)
        with db():
            db().execute("DELETE FROM sessions WHERE expires_at <= ?", (time.time(),))
            db().execute(
                "INSERT INTO sessions VALUES (?, ?, ?)",
                (digest(token), account["id"], time.time() + 30 * 24 * 3600),
            )
        return {"token": token}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        with db():
            db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.session_hash,))
        return {"message": "You have been signed out."}

    @app.get("/api/me")
    @authenticated
    def me():
        return public_account(g.account)

    @app.patch("/api/me")
    @authenticated
    def update_me():
        data = payload()
        if "email" not in data:
            raise ValidationError("Include the email address you would like to use.")
        address = email(data["email"])
        try:
            with db():
                db().execute(
                    "UPDATE accounts SET email = ?, email_key = ? WHERE id = ?",
                    (address, address.casefold() if address else None, g.account["id"]),
                )
                if address != g.account["email"]:
                    db().execute("DELETE FROM password_resets WHERE account_id = ?", (g.account["id"],))
        except sqlite3.IntegrityError:
            return {"error": "That email address is already in use."}, 409
        return public_account(db().execute("SELECT * FROM accounts WHERE id = ?", (g.account["id"],)).fetchone())

    @app.post("/api/me/password")
    @authenticated
    def change_password():
        data = payload()
        new_hash = generate_password_hash(password(data.get("new_password")))
        current = data.get("current_password")
        with db():
            db().execute("BEGIN IMMEDIATE")
            account = db().execute("SELECT * FROM accounts WHERE id = ?", (g.account["id"],)).fetchone()
            if not isinstance(current, str) or len(current) > 1024 or not check_password_hash(account["password_hash"], current):
                return {"error": "Your current password is incorrect."}, 400
            db().execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (new_hash, account["id"]))
            db().execute("DELETE FROM password_resets WHERE account_id = ?", (account["id"],))
            db().execute(
                "DELETE FROM sessions WHERE account_id = ? AND token_hash != ?",
                (account["id"], g.session_hash),
            )
        return {"message": "Your password has been updated."}

    @app.post("/api/auth/password-reset")
    def request_reset():
        data = payload()
        username, address = data.get("username"), data.get("email")
        if username is not None and not isinstance(username, str):
            raise ValidationError("Enter your username or email address.")
        if address is not None and not isinstance(address, str):
            raise ValidationError("Enter your username or email address.")
        if not (username and username.strip()) and not (address and address.strip()):
            raise ValidationError("Enter your username or email address.")
        with db():
            db().execute("BEGIN IMMEDIATE")
            if username and username.strip():
                account = db().execute("SELECT * FROM accounts WHERE username = ?", (username.strip(),)).fetchone()
            else:
                account = db().execute("SELECT * FROM accounts WHERE email_key = ?", (address.strip().casefold(),)).fetchone()
            if account is not None and account["email"]:
                token = secrets.token_urlsafe(32)
                db().execute("DELETE FROM password_resets WHERE account_id = ? OR expires_at <= ?", (account["id"], time.time()))
                db().execute("INSERT INTO password_resets VALUES (?, ?, ?)", (digest(token), account["id"], time.time() + 3600))
                base = (app.config["PUBLIC_BASE_URL"] or request.host_url).rstrip("/")
                link = f"{base}/reset?token={token}"
                body = (
                    f"Hi {account['username']},\n\n"
                    "A fresh start is one click away. Use the link below to choose a new Keyspace password:\n\n"
                    f"{link}\n\n"
                    "This link expires in one hour and can only be used once.\n"
                    "If you didn't request a password reset, you can safely ignore this message.\n\n"
                    "Stay safe,\nThe Keyspace team"
                )
                db().execute(
                    "INSERT INTO outbox (recipient, recipient_key, subject, body, sent_at) VALUES (?, ?, ?, ?, ?)",
                    (account["email"], account["email_key"], "Reset your Keyspace password", body, datetime.now(UTC).isoformat()),
                )
        return {"message": RESET_MESSAGE}

    @app.post("/api/auth/password-reset/confirm")
    def confirm_reset():
        data = payload()
        token = data.get("token")
        if not isinstance(token, str) or not token or len(token) > 256:
            raise ValidationError("This reset link is invalid or has expired. Please request a new one.")
        new_hash = generate_password_hash(password(data.get("new_password")))
        with db():
            db().execute("BEGIN IMMEDIATE")
            reset = db().execute(
                "SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ?", (digest(token), time.time())
            ).fetchone()
            if reset is None:
                return {"error": "This reset link is invalid or has expired. Please request a new one."}, 400
            db().execute("UPDATE accounts SET password_hash = ? WHERE id = ?", (new_hash, reset["account_id"]))
            db().execute("DELETE FROM password_resets WHERE account_id = ?", (reset["account_id"],))
            db().execute("DELETE FROM sessions WHERE account_id = ?", (reset["account_id"],))
        return {"message": "Your password has been reset. You can now sign in."}

    @app.get("/api/outbox")
    def outbox():
        address = request.args.get("to", "").strip()
        if not address:
            raise ValidationError("Enter an email address to open its mailbox.")
        messages = db().execute(
            'SELECT id, recipient AS "to", subject, body, sent_at FROM outbox WHERE recipient_key = ? ORDER BY id DESC',
            (address.casefold(),),
        ).fetchall()
        return {"items": [dict(message) for message in messages]}

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return {"error": "API endpoint not found."}, 404
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
