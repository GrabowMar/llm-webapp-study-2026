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

## Run

Docker:

```sh
docker build -t kanban .
docker run --rm -p 8000:8000 -v ./data:/app/data kanban
```

Then open http://localhost:8000.

Local development (from the repository root):

```sh
pip install -r backend/requirements.txt -c backend/requirements.lock
gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app   # backend + built frontend on :8000

cd frontend
npm ci
npm run build        # writes frontend/dist
npm run dev          # Vite dev server on :5173, proxies /api to :8000
```

The SQLite database is created automatically at `./data/kanban.db` (override with the
`DATA_DIR` environment variable).

## API

All request/response bodies are JSON. Authenticated endpoints require
`Authorization: Bearer <token>`. Errors look like `{"error": "...", "errors": {"field": "..."}}`
with status 400 (validation), 401 (auth), 404 (missing) or 409 (duplicate username).

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | no | `{"status": "ok"}` |
| POST | `/api/auth/register` | no | Body `{"username","password"}` → 201 `{"id","username","token"}` |
| POST | `/api/auth/login` | no | Body `{"username","password"}` → 200 `{"token"}` |
| GET | `/api/auth/me` | yes | Current user `{"id","username"}` |
| GET | `/api/tasks` | no | `{"items": [task...], "total": n, "counts": {"todo": n, "in_progress": n, "done": n}}`; optional `?status=` (`todo`/`in_progress`/`done`) and `?priority=` (`low`/`medium`/`high`) filters |
| GET | `/api/tasks/{id}` | no | Single task |
| POST | `/api/tasks` | yes | Body `{"title","description","status","priority","position"?}` → 201 task |
| PATCH | `/api/tasks/{id}` | yes | Partial body of the same fields; `status` moves the task to another column, `position` sets its 1-based slot (send both to move and reorder in one call) |
| DELETE | `/api/tasks/{id}` | yes | 200 `{"ok": true}`; remaining tasks close the position gap |

A task is `{"id", "title", "description", "status", "priority", "position", "updated_at"}`.
Positions are 1-based and gapless within each column; the list is ordered
`todo`, `in_progress`, `done`, then by position. Everyone may view the board;
register or sign in to create, edit, move, reorder and delete tasks.
