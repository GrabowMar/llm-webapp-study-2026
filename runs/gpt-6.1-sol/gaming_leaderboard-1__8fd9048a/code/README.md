# Highscore

A community game leaderboard built with Flask, React, TypeScript, Tailwind CSS and SQLite.

## Run

```sh
docker build -t highscore .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" -e ADMIN_PASSWORD highscore
```

Set `ADMIN_PASSWORD` in your environment before running to enable the reserved `admin` account. If it is unset or empty, admin sign-in is disabled. Changing or disabling the password invalidates existing admin sessions. There is no default password.

For local development:

```sh
python3.13 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -c backend/requirements.lock
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python backend/app.py
```

Use `npm --prefix frontend run dev` in a second terminal for Vite hot reload; `/api` requests are proxied to port 8000.

## Behavior

- Registration creates an account; login returns a bearer token. Tokens expire after 30 days, are stored hashed in SQLite, and survive server restarts. `GET /api/auth/me` restores the current account and `POST /api/auth/logout` invalidates its token.
- Usernames are case-insensitively unique, 1–32 characters, using letters, numbers, `_`, `.` or `-`. Passwords are 1–256 characters and stored using scrypt hashing.
- Scores are non-negative integers up to `9007199254740991`. The server sets `achieved_at` in UTC. Only the authenticated account can own a submission.
- `period=all` (default), `week` and `today` select all time, the current week starting Monday at 00:00 UTC, and the current UTC day.
- Each player appears once, using their best visible score in that period. Higher scores rank first; ties go to the earliest achievement, then submission ID. Ranks are unique and do not change when searching.
- `player` is a case-insensitive substring filter. `limit` defaults to 50 (maximum 1000); leaderboard `total` counts matching players before the limit.
- A personal best is strictly higher than the player's previous visible all-time best, or their first visible score. A submission's `rank` is the player's all-time rank, even if that submission is lower than their best.
- Hidden scores remain in submission history and admin results, but are excluded from leaderboards, ranks and personal bests. With no visible scores, `best_score` is `null`.
- Admin pagination defaults to `page=1&page_size=50`; maximum page size is 100. All score histories are newest first.
- Validation errors return JSON with an `error` string. Protected requests return 401 without a valid bearer token; non-admin moderation requests return 403.

## Checks

```sh
.venv/bin/pip install ruff
.venv/bin/python -m unittest discover -s backend -p 'test_*.py' -v
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).
