# Fieldwork — Sensor dashboard

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Local development

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -c backend/requirements.lock
.venv/bin/python backend/app.py
```

In another terminal:

```sh
cd frontend
npm ci
npm run dev
```

Vite proxies `/api` to the backend on port 8000. To serve everything from Flask, run `npm run build` in `frontend/`, then start the backend. Sensor pages support direct navigation at `/sensors/{id}`.

## Checks

```sh
.venv/bin/python -m unittest backend.test_app -v
cd frontend
npm run lint
npm run typecheck
npm run build
```

## Accounts and data

Register with `POST /api/auth/register`, then sign in with `POST /api/auth/login`. Both accept `username` and `password`. Login returns an opaque bearer token valid for 30 days; use `Authorization: Bearer <token>` for write requests. `GET /api/auth/me` identifies the current account and `POST /api/auth/logout` revokes its token. Passwords are hashed, and only hashed tokens are stored.

SQLite is stored at `./data/sensors.sqlite3`. Set `DATABASE_PATH` to override its location. Mount `/app/data` in the container to retain users, sessions, sensors, and readings across container replacement. Sensors are public; only their owner can add readings or delete them. Reading values must be finite numbers; history supports `limit` from 1 to 1000 (default 100), newest first. Timestamps are server-generated UTC values.

The frontend refreshes every 10 seconds. An empty public workspace displays clearly labeled illustrative demo sensors; these are not persisted and disappear when real sensors are registered or a user signs in.
