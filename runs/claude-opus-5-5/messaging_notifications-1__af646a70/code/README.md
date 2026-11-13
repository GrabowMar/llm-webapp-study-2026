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

## Notification center

- Accounts: `POST /api/auth/register`, `POST /api/auth/login` (returns `{"token"}`; send `Authorization: Bearer <token>`), `GET /api/auth/me`, `POST /api/auth/logout`.
- Admin: the account `admin` signs in with the password from `ADMIN_PASSWORD`; when unset or empty, admin sign-in is disabled.
- Notifications: `GET/POST /api/notifications`, `POST /api/notifications/read-all`, `GET/PATCH/DELETE /api/notifications/{id}`, `POST /api/admin/broadcast`.
- SQLite database: `data/app.db` (override the directory with `DATA_DIR`).
- Frontend checks: `npm run typecheck` and `npm run build` in `frontend/`.
