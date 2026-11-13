# Stockroom

A warehouse inventory app with a public inventory, stock movement history, and authenticated inventory management. Flask serves the JSON API and the React/Tailwind frontend from the same server.

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

```sh
docker build -t stockroom .
docker run --rm -p 8000:8000 -v "$PWD/data:/app/data" stockroom
```

The first launch adds twelve starter warehouse items. Set `SEED_DEMO=0` on the first launch for an empty inventory. Starter items are ordinary, editable records and are never recreated after deletion. No accounts or passwords are preconfigured; create an account through the frontend.

## Local development

```sh
python3 -m pip install -r backend/requirements.txt -c backend/requirements.lock
python3 backend/app.py
```

In a second terminal:

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Vite proxies `/api` to Flask on port 8000. For the same-server frontend, run `npm run build --prefix frontend` and open port 8000 instead.

## Verification

```sh
python3 -m unittest backend.test_app -v
python3 -m ruff check backend
npm run lint --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

Ruff is an optional development tool (`python3 -m pip install ruff`); it is not needed by the production image.

## API

Register at `POST /api/auth/register` with `username` and `password`, then log in at `POST /api/auth/login` to obtain a token. Send `Authorization: Bearer <token>` on write requests. Tokens are stored hashed in SQLite, survive server restarts, expire after 30 days, and are revoked by `POST /api/auth/logout`. Passwords are hashed with scrypt.

Read inventory at `GET /api/items` using `q`, `location`, `low_stock`, `page`, and `page_size` (default 10, maximum 100). Search matches item names or SKUs; items are sorted by name. `low_stock=true` includes items whose quantity is at or below their reorder level.

Create items with `POST /api/items`, providing `name`, `sku`, `location`, `quantity`, and `reorder_level`. Replace details with `PUT /api/items/{id}`; quantity is never changed by an edit. Delete with `DELETE /api/items/{id}`. Read movement history at `GET /api/items/{id}/movements` and record movements with `POST` to the same path using a nonzero integer `delta` and a `reason`.

Quantities and reorder levels must be nonnegative whole numbers. SKUs and usernames are case-insensitively unique. Invalid input returns JSON with an `error` and field-specific `errors`; duplicate SKUs return 409, missing records return 404, and unauthenticated writes return 401. Movement updates and history inserts share a single SQLite write transaction, so an overdraft never partially changes stock, including concurrent requests.

Additional read endpoints: `/api/auth/me` returns the current signed-in username, `/api/overview` returns warehouse totals and location summaries, and `/api/activity` returns a paged list of all movements.
