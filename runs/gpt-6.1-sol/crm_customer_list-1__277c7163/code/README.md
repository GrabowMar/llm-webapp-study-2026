# Commonplace

A private, shared customer directory built with Flask, SQLite, React, TypeScript, and Tailwind CSS. Team members can manage every customer and log calls, emails, and meetings.

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
python3 -m pip install -r backend/requirements-dev.txt -c backend/requirements.lock
python3 backend/app.py
```

In another terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

Vite proxies `/api` to Flask on port 8000. For a single-server production run, build the frontend with `npm run build` and run Flask or gunicorn from the workspace root. SQLite data and hashed bearer sessions live in `data/directory.sqlite3`; `DATABASE_PATH` can override this location.

## Docker

```sh
docker build -t commonplace .
docker run --rm -p 8000:8000 -v "$(pwd)/data:/app/data" commonplace
```

Open the app on port 8000 and create an account. Registration creates an account; sign in afterward to receive a token. There are no default accounts or seeded customers. Bearer sessions persist across restarts, expire after 30 days, and are revoked on sign-out. Passwords use Werkzeug's scrypt hashing; only token hashes are stored in SQLite.

## Verification

From the workspace root:

```sh
python3 -m unittest backend.test_app -v
python3 -m ruff check backend
python3 -m ruff format --check backend
```

From `frontend/`:

```sh
npm run lint
npm run typecheck
npm run build
```

Optional browser integration test (after building the frontend):

```sh
npx playwright install chromium
npm run test:e2e
```

It starts the production gunicorn server on port 8001 with an isolated SQLite database under `.cache/`, exercises account and directory flows on desktop and mobile, and saves screenshots there.

## API details

All customer, interaction, and workspace endpoints require `Authorization: Bearer <token>`. `/api/health`, registration, and login are public. Validation errors return an `error` message and an `errors` object keyed by field. Invalid input returns 400; duplicate usernames or customer emails return 409; missing customers return 404. Successful customer and interaction creation returns 201; deletion returns 204.

Customer names are required. Email, phone, company, and notes are optional and are returned as `null` when empty. Email addresses are validated and unique without regard to case. PUT fully replaces the editable fields and clears omitted optional fields. Search matches name, email, phone, company, and notes; company filtering is an exact, case-insensitive match. Pagination defaults to page 1 and page size 20, with page sizes from 1 to 100.

Interaction kinds are `call`, `email`, and `meeting`; summaries are required. `occurred_at` accepts ISO 8601 dates, is normalized to UTC, and defaults to the current time when omitted. A timezone-less timestamp is interpreted as UTC. `logged_by` is the authenticated member's username, never client-supplied. Interactions are sorted by occurrence time descending, then ID descending. `last_contacted_at` is the latest occurrence time, not the time an interaction was entered.

The frontend also uses authenticated `/api/auth/me`, `/api/auth/logout`, and `/api/overview` endpoints for the current account, sign-out, directory counts, and company filter options.
