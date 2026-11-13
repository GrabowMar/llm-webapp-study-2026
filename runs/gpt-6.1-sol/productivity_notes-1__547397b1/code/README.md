# Marginalia

A public notebook for small thoughts and big ideas. Browse notes without an account; sign in to write, tag, pin, edit, and delete your own notes. Content is always plain text.

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Run locally

```sh
python3 -m pip install -r backend/requirements.txt -c backend/requirements.lock
npm --prefix frontend ci
npm --prefix frontend run build
python3 -m gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app
```

For frontend development, run `npm --prefix frontend run dev` alongside the backend. Vite proxies `/api` to port 8000.

```sh
docker build -t marginalia .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" marginalia
```

SQLite is stored in `data/notes.sqlite3`. Set `DATABASE_PATH` to override its location. Accounts, password hashes, notes, tags, and hashed authentication tokens survive restarts. Tokens expire after 30 days; signing out revokes the current token.

## Checks

```sh
python3 -m unittest discover -s backend -v
python3 -m ruff check backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Ruff is an optional development tool (`python3 -m pip install ruff`). API tests use isolated temporary databases.

## API

Register with `POST /api/auth/register` and sign in with `POST /api/auth/login`, sending JSON `username` and `password`. Use the returned token as `Authorization: Bearer <token>`. `GET /api/auth/me` restores the signed-in identity; `POST /api/auth/logout` revokes the current session.

- `GET /api/notes`: public, with optional `tag`, `author`, `q`, `page`, and `page_size` filters. Ordered by pinned first, then most recently updated. Defaults to page 1 and 12 items; page sizes range from 1 to 100. Search matches literal substrings in title and content. Author names are case-insensitive.
- `POST /api/notes`: authenticated; requires `title` and `content`, accepts `tags` and `pinned`.
- `GET /api/notes/{id}`: public note details.
- `PATCH /api/notes/{id}`: author-only; updates supplied fields and the update timestamp.
- `DELETE /api/notes/{id}`: author-only; returns 204.
- `GET /api/tags`: all tags in use, ordered by note count descending, then tag alphabetically.

Note authors are returned as username strings. Usernames use 3–32 letters, digits, underscores, or hyphens; passwords use 8–128 characters. Titles are nonblank and at most 200 characters. Content is text up to 100,000 characters and may be empty. Tags are an array of up to 12 nonblank strings, each up to 40 characters; tags are trimmed, lowercased, and deduplicated. `pinned` must be a JSON boolean. Unknown note fields are rejected. Validation errors return status 400 with `error` and field-level `errors`; duplicate usernames return 409, invalid authentication 401, forbidden writes 403, and missing notes 404.
