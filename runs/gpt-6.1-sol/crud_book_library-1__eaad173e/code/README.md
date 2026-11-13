# Folio — a shared book library

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Development

```sh
python3 -m pip install -r backend/requirements.txt -c backend/requirements.lock
gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app
```

In a second terminal, from `frontend/`, run `npm ci` and `npm run dev`. Vite proxies `/api` to port 8000. Run `npm run build` to let Flask serve the production frontend.

## Checks

```sh
python3 -m unittest backend.test_app -v
ruff check backend
```

From `frontend/`:

```sh
npm run lint
npm run typecheck
npm run build
```

## Data and accounts

SQLite data is stored in `data/library.sqlite3`. Set `DATABASE_PATH` to override it. Mount `/app/data` as a persistent volume when running the container:

```sh
docker build -t folio .
docker run --rm -p 8000:8000 -v folio-data:/app/data folio
```

A fresh database starts with 12 books and 48 sample reader reviews. Sample readers have randomly generated passwords and cannot be used as demo logins. Set `SEED_LIBRARY=0` to start an empty catalogue. Seeding happens only once; deleted books are not recreated on restart.

Register using `POST /api/auth/register`, then sign in using `POST /api/auth/login`. Send the returned token as `Authorization: Bearer <token>`. Passwords use Werkzeug's scrypt hashing. Opaque tokens are stored only as SHA-256 hashes, expire after 30 days, and survive server restarts. `POST /api/auth/logout` revokes the current token.

The public catalogue supports case-insensitive title, author, and ISBN search. Pagination defaults to 8 books per page; `page_size` accepts 1–100. Ratings are whole numbers from 1 to 5, and review comments are optional (up to 5,000 characters). Any signed-in reader can add, edit, or delete any book. Each reader may review each book once.
