# XMLCheck

A well-formedness checker with a Flask JSON API, a React / TypeScript frontend, and private SQLite-backed check history. XML is parsed for syntax only: schemas are not validated and external DTDs, entities, and includes are never fetched. Error positions are one-based. Anonymous checks are not stored; saved checks store only the first 200 characters of XML and the result.

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Production

```sh
docker build -t xmlcheck .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" xmlcheck
```

Open `http://localhost:8000`. Mount `/app/data` to retain accounts, sessions, and saved checks across container replacements. Bearer tokens expire after 30 days and are revoked on sign-out; only hashes of passwords and tokens are stored.

## Development

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -c backend/requirements.lock
.venv/bin/pip install -r backend/requirements-dev.txt
npm --prefix frontend ci
.venv/bin/flask --app backend.app run --port 8000
```

In another terminal, run `npm --prefix frontend run dev`. Vite proxies `/api` to the Flask server. Set `DATABASE_PATH` to override the default `data/xmlcheck.sqlite3` path.

## Verification

```sh
python3 -m unittest discover -s backend -p 'test_*.py' -v
python3 -m ruff check backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

## JSON API

All write requests use `Content-Type: application/json`. Account endpoints take `username` and `password`. Register with `POST /api/auth/register` (201), then sign in using `POST /api/auth/login` (200) to receive `{"token":"..."}`. Authenticated requests use `Authorization: Bearer <token>`.

- `GET /api/health`: readiness check.
- `GET /api/auth/me`: signed-in username.
- `POST /api/auth/logout`: revoke the current token (204).
- `POST /api/validate/xml`: submit `{"xml":"<root/>"}` for an unstored result.
- `POST /api/validations`: validate and save to the signed-in user's history (201).
- `GET /api/validations?valid=true&page=1&page_size=10`: private history, newest first. Omit `valid` for all checks; use `false` for invalid checks. Pages start at 1; page sizes range from 1 to 100.
- `DELETE /api/validations/{id}`: delete an owned check (204); unavailable or unowned IDs return 404.

Validation results contain `valid`, `error`, `line`, `column`, and `root_element`. Valid documents have null error positions; invalid documents have a null root. Saved checks also contain `id`, `xml_preview`, and a UTC `created_at`. History returns `items`, `total`, `page`, and `page_size`. XML inputs are limited to 1,000,000 characters. Invalid requests return JSON errors.
