# Form & Field

A small, considered shop built with Flask, SQLite, React, TypeScript, Vite and Tailwind CSS. The catalogue is public; accounts have personal, persistent carts. Prices and totals are calculated by the server in integer cents.

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask entry point (`backend/app.py`, served by gunicorn as `app:app`), application factory and API in `backend/shop.py`; dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## Run with Docker

```sh
docker build -t form-field .
docker run --rm -p 8000:8000 --env ADMIN_PASSWORD -v "$(pwd)/data:/app/data" form-field
```

Set `ADMIN_PASSWORD` in your environment before running the container to enable the `admin` account. There is no default admin password. Without a non-empty value, admin login and admin tokens are disabled. Changing the password on restart invalidates previous admin sessions.

Open the app on port 8000. The first start seeds 12 products with at least 10 units in stock. SQLite stores accounts, hashed passwords, hashed bearer tokens, products and carts in `data/shop.sqlite3`. Mount the entire data directory, including SQLite journal files, for persistence. Regular sessions last 30 days and survive restarts; sign-out revokes the token.

## Local development

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt -c backend/requirements.lock -r backend/requirements-dev.txt
npm --prefix frontend ci
npm --prefix frontend run build
.venv/bin/python backend/app.py
```

For hot reload, run `npm --prefix frontend run dev` in a second terminal. Vite proxies `/api` to the Flask server on port 8000.

## Checks

```sh
.venv/bin/python -m unittest discover -s backend -v
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Browser tests exercise the production frontend served by Flask, using a separate temporary SQLite database and a test-only admin password:

```sh
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Browser tests require the root `.venv` from the development steps above and a current frontend build.

## API behavior

- Registration returns 201. Login returns a bearer token; send it as `Authorization: Bearer <token>`. Account usernames are case-insensitive and `admin` is reserved.
- The catalogue supports `q`, `page` (default 1), and `page_size` (default 8, maximum 100). Search matches names and descriptions; results are ordered by name. Only active products are public.
- Cart additions merge quantities. Quantities must be positive integers and must not exceed current stock. Adding items never changes or reserves stock. Inactive products remain stored in carts but are excluded from returned items and totals.
- Another account’s cart item returns 404. Protected endpoints require a valid token (401); admin endpoints reject other accounts (403).
- Product prices are non-negative and have at most two decimal places. Stock is a non-negative integer. Rejected requests return JSON with a `message` shown by the frontend.
- Additional endpoints: `GET /api/auth/me`, `POST /api/auth/logout`, and paged `GET /api/admin/products` (including inactive products).
- This app is a catalogue and cart, not a checkout or payment system.
