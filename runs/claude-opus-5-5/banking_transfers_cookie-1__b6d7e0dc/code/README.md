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

## Bank app

- API: `/api/auth/{register,login,logout,csrf}`, `/api/account`, `/api/transfers[/<id>]`. Sign-in returns a bearer token (`Authorization: Bearer <token>`); mutating requests may also send `X-CSRF-Token` (validated when present).
- Data: SQLite at `./data/bank.sqlite3` (override with `DATA_DIR`). Amounts are stored as integer cents; transfers run in a single `BEGIN IMMEDIATE` transaction.
- Frontend: React + TypeScript + Tailwind CSS v4 (`npm run typecheck`, `npm run build`).
