# Marginal

A private link library with automatically fetched page previews, persistent bearer-token accounts, and a React/Tailwind frontend.

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
.venv/bin/gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app
```

In another terminal, run `npm ci` and `npm run dev` from `frontend/`. Vite proxies `/api` to the backend. Run `npm run build` from `frontend/` to serve the production frontend from Flask instead.

## Docker

```sh
docker build -t marginal .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" marginal
```

SQLite is stored in `./data/bookmarks.sqlite3`. `DATA_DIR` can override the data directory. Accounts, previews, and login tokens survive server restarts. Passwords use scrypt hashes; opaque bearer tokens are stored only as SHA-256 hashes and expire after 30 days. Sign-out revokes the current token.

## Checks

```sh
.venv/bin/python -m unittest discover -s backend/tests -v
.venv/bin/pip install ruff
.venv/bin/ruff check backend
```

From `frontend/`, run `npm run lint`, `npm run typecheck`, and `npm run build`. Backend tests use isolated temporary databases and a local HTTP fixture; no external network access is required. Building the frontend also enables the static-serving test.

## API

Register with `POST /api/auth/register` and log in with `POST /api/auth/login`, sending JSON `{"username":"your-name","password":"your-password"}`. Login returns `{"token":"…"}`. Send `Authorization: Bearer <token>` on preview requests. `GET /api/auth/me` returns the current username; `POST /api/auth/logout` revokes the token.

- `POST /api/previews`: JSON `{"url":"https://example.com/"}`; returns the saved preview with status 201.
- `GET /api/previews?page=1&page_size=12`: newest-created first; returns `items`, `total`, `page`, and `page_size`. Page sizes range from 1 to 100.
- `GET /api/previews/{id}`: one owned preview.
- `POST /api/previews/{id}/refresh`: refetches the original link without changing creation order.
- `DELETE /api/previews/{id}`: deletes the owned preview; returns 204.

All API errors have a JSON `error` message. Another user's preview returns 404. Open Graph text takes precedence over standard metadata, relative image URLs resolve against the final page URL, and fetched text is stripped of markup. Pages without metadata are saved with empty text fields and a null image. HTML error pages retain their HTTP status code; unreachable and non-HTML pages produce an error without saving or replacing a preview.

Fetching accepts only public HTTP(S) destinations, checks every redirect, pins connections to validated DNS addresses, and verifies HTTPS certificates. Private, loopback, reserved, and link-local addresses are blocked. Fetching is limited to five redirects, 2 MiB of HTML, and a 20-second transfer budget with per-socket timeouts. The sandbox has no general outbound network access, so live public link fetching requires a deployment with outbound access; the included tests exercise fetching through a local fixture.

The signed-out frontend shows clearly labeled example previews. They are not saved records. Library search filters the current page, and grid/list views and paging work on your own saved links.
