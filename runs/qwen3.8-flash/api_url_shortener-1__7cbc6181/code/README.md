# App

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.txt` holds the resolved, hash-pinned versions (direct and transitive). The frontend uses `frontend/package-lock.json` (`npm ci`).
