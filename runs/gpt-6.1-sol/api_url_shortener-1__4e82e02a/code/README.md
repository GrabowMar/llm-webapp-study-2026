# Trim URL shortener

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and hashes and is installed directly. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Container

```sh
docker build -t trim .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" -e ADMIN_PASSWORD trim
```

Set `ADMIN_PASSWORD` in your shell before starting the container to enable the reserved `admin` account. If it is unset or empty, admin sign-in is disabled. There is no default admin password. Changing or removing it invalidates existing admin sessions.

## Local development

From the workspace root:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.lock
pip install -r backend/requirements-dev.txt
gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app
```

In a second terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

Vite proxies `/api` and `/r` to Flask. `npm run build` creates the production frontend, which Flask serves directly on port 8000. SQLite is stored at `data/shortlinks.sqlite3` relative to the server's working directory. Back up the data directory while the server is stopped to include SQLite's WAL files safely.

## Verification

```sh
python3 -m unittest discover -s backend -p 'test_*.py' -v
ruff check backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Browser tests cover registration, sign-in, validation, copying, paging, deletion, and moderation at desktop and mobile sizes:

```sh
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

The browser test server uses a temporary SQLite database, never your persistent data. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an already installed Chromium binary instead of downloading one.

## API

Register with `POST /api/auth/register` and sign in with `POST /api/auth/login`, supplying JSON `username` and `password`. Use the returned token as `Authorization: Bearer <token>` on authenticated requests. Tokens expire after 30 days, are stored hashed in SQLite, and survive restarts. `POST /api/auth/logout` revokes the current token; `GET /api/auth/me` returns the signed-in user.

Create a link with `POST /api/links` and JSON `{"original_url": "https://example.com"}`. Link objects contain `id`, `original_url`, `short_code`, `short_url` (a relative `/r/<code>` path), `click_count`, `created_at` (UTC ISO 8601), `owner` (username), and `is_active`.

`GET /api/links` and `GET /api/links/{id}` are public. `DELETE /api/links/{id}` is restricted to the owner. `GET /api/admin/links` includes disabled links; `POST /api/admin/links/{id}/toggle` switches their active state. Disabled links return 404 on public detail, delete, and redirect endpoints.

List responses are `{"items": [...], "total": n, "page": n, "page_size": n}`. Paging defaults to page 1 with 10 items, and supports 1–100 items per page. Lists sort newest first and accept an optional `q` search. `GET /api/links/mine` lists the signed-in user's active links. `GET /api/stats` returns community-wide active-link counts, clicks, and links created today (UTC). Validation errors return JSON `{"error": "message"}`.
