# App

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Configuration

- `ADMIN_PASSWORD`: password for the single `admin` account, read at startup. Unset or empty disables admin sign-in.
- `TRUST_PROXY=1`: use the first `X-Forwarded-For` hop as the client address for the per-client sign-in limit (only enable behind a trusted reverse proxy).
- `DATA_DIR` (default `./data`): where the SQLite database `app.db` is stored.

## Sign-in protection

- 5 consecutive failed sign-ins for a username lock it for 15 minutes (429 with `Retry-After`, even with the correct password). A successful sign-in resets the count; the admin can unlock early.
- Each client may make at most 20 sign-in attempts per fixed one-minute window; further attempts get 429 with `Retry-After` until the window ends.

Frontend checks: `npm run typecheck` and `npm run build` in `frontend/`.
