# Table & Thyme

A recipe book built with Flask, SQLite, React, TypeScript, Vite and Tailwind CSS.

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

From the workspace root:

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -c backend/requirements.lock -r backend/requirements-dev.txt
.venv/bin/python backend/app.py
```

In a second terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

For a production build, run `npm run build` in `frontend/`. Flask serves that build, including recipe deep links, on port 8000.

## Checks

From the workspace root:

```sh
python3 -m unittest backend.test_app -v
python3 -m ruff check backend
```

From `frontend/`:

```sh
npm run lint
npm run typecheck
npm run build
```

Browser checks use the production build and an isolated SQLite database under `./data`. Screenshots and results are written to `frontend/test-results/`.

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

After building the frontend, `python3 -m unittest backend.test_production -v` checks Gunicorn startup, static assets, deep links and persistence across a real server restart. Docker itself must be available to build and run the image.

## Docker

```sh
docker build -t table-and-thyme .
docker run --rm -p 8000:8000 -v "$PWD/data:/app/data" table-and-thyme
```

The database is `./data/recipes.sqlite3`. Five sample recipes are seeded only once, and recipes, accounts and sessions survive a restart. `RECIPE_DATABASE` can override the database path for testing.

## API

Registration accepts a unique username (3–30 letters, digits, dots, hyphens or underscores) and a password (8–128 characters). Login returns an opaque bearer token valid for 30 days. Send it as `Authorization: Bearer <token>` for recipe creation, replacement or deletion. Passwords are hashed; only a hash of each session token is stored. Sign-out revokes the token with `POST /api/auth/logout`; `GET /api/auth/me` returns the current username.

Recipes require a title, category, ordered array of ingredient strings, instructions, integer `prep_minutes` (0–1440) and integer `servings` (1–100). API errors return `{"error": "message"}` and validation errors additionally include an `errors` object keyed by field name. Lists accept `category`, `q` (literal, case-insensitive title search), `page` (default 1) and `page_size` (default 6, maximum 100). `author` is the author’s username. `GET /api/categories` returns available categories for filtering.
