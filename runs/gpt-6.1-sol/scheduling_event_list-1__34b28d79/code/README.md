# App

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and hashes and is installed directly. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Local development

Install Python dependencies with `python3 -m pip install -r backend/requirements.lock` and frontend dependencies with `npm ci` in `frontend/`.
Run `python3 backend/app.py` from the workspace root and `npm run dev` in `frontend/`. Vite proxies `/api` to port 8000.
Run `npm run build` in `frontend/` to serve the production frontend directly from Flask.

## Verification

- API tests: `python3 -m unittest backend.test_app -v`
- Python lint (requires Ruff): `python3 -m ruff check backend`
- Frontend tests: `npm test` in `frontend/`
- Frontend lint: `npm run lint` in `frontend/`
- Type checks: `npm run typecheck` in `frontend/`
- Production build: `npm run build` in `frontend/`

## API details

Events require `title`, `start_time`, and `end_time`. `description` and `location` are optional and are cleared to `null` when omitted in a replacement. End time must be after start time. Validation errors return HTTP 400 with `error` and an `errors` object keyed by field.
Date-times use ISO 8601; dates without an offset are interpreted as UTC and responses use a trailing `Z`.
The list endpoint filters event start times. Date-only range boundaries include the entire date; date-time boundaries are inclusive. Results are sorted by start time.
Passwords are hashed; opaque bearer tokens are stored as hashes in SQLite and remain valid for 30 days across restarts. `/api/auth/me` returns the current username, and `POST /api/auth/logout` revokes the current token.
Data is stored in `data/calendar.sqlite3`. The `DATABASE_PATH` environment variable can override the database path.

## Docker

Build with `docker build -t gather .` and start with `docker run --rm -p 8000:8000 -v "$PWD/data:/app/data" gather` to persist accounts and events across container restarts.
