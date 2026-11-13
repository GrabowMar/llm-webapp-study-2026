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

## Blog app

- Set `ADMIN_PASSWORD` to enable the `admin` account (admin sign-in is disabled when unset/empty).
- API: `/api/auth/{register,login,logout,me}`, `/api/posts[/{id}]`, `/api/admin/posts/{id}/toggle`. Auth via `Authorization: Bearer <token>`.
- Validation errors answer 400 with `{"error": ..., "errors": {field: message}}`.
- Backend tests: `pip install pytest && pytest tests`. Frontend type check: `npm run typecheck` in `frontend/`.
