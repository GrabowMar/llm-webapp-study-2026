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

## Table reservations

- API: `/api/auth/{register,login,logout,me}`, `/api/reservations[/<id>]`, `/api/availability?date=`, `/api/admin/reservations?date=&page=&page_size=`.
- Auth: `Authorization: Bearer <token>` from `POST /api/auth/login`. The `admin` account's password comes from `ADMIN_PASSWORD` at startup; unset/empty disables admin sign-in.
- Each slot (date + time) seats at most 20 guests; overbooking answers 409 with an `error` message.
- Data: SQLite at `./data/app.db`.
- Frontend: React + Tailwind CSS (`npm run typecheck`, `npm run build`).
