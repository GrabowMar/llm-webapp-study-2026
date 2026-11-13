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

## Todo app

- API (JSON, under `/api`): `POST /auth/register`, `POST /auth/login` (returns `{"token": ...}`; send `Authorization: Bearer <token>`), `GET /auth/me`, `POST /auth/logout`, and `GET/POST /todos`, `GET/PATCH/DELETE /todos/{id}`. Validation errors answer 400 with `{"error": "...", "errors": {"field": "message"}}`.
- Data is stored in SQLite at `./data/app.db` (override the directory with `DATA_DIR`).
- Frontend: React + TypeScript + Tailwind CSS (via `@tailwindcss/vite`); `npm run build` type-checks and builds to `frontend/dist`.
- Local dev: run `gunicorn --pythonpath backend app:app --bind 127.0.0.1:8000` and `npm run dev` in `frontend/` (Vite proxies `/api`).
