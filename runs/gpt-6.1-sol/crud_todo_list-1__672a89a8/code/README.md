# Tidy

A private todo workspace built with Flask, SQLite, React, TypeScript, Vite, and Tailwind CSS. Create an account, add or edit tasks, filter by completion and priority, and track overdue tasks. Completion checkboxes save immediately and revert with an error if saving fails.

## Run with Docker

From the repository root:

```sh
docker build -t tidy .
docker run --rm --name tidy -p 8000:8000 -v tidy-data:/app/data tidy
```

Open `http://localhost:8000`. The container uses Gunicorn on port 8000 to serve both the frontend at `/` and the JSON API under `/api`.

The named volume preserves users, sessions, and tasks across container replacements. SQLite data is stored in `/app/data/todos.sqlite3`. Do not delete the volume unless you want to erase all accounts and tasks. For deployment beyond localhost, use an HTTPS reverse proxy and add authentication rate limiting.

## Local development

Use Python 3.13 and Node.js 24, matching the Docker build. From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r backend/requirements.lock
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm --prefix frontend ci
.venv/bin/python backend/app.py
```

In a second terminal, run `npm --prefix frontend run dev` and open the address Vite prints. Vite proxies `/api` to the backend on port 8000.

To serve the production frontend locally instead:

```sh
npm --prefix frontend run build
.venv/bin/gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app
```

Stop the development backend before starting Gunicorn on the same port. Run the backend from the repository root so the default data directory is `./data`. Set `DATA_DIR` to override the directory. Direct execution of `backend/app.py` also accepts `PORT`; the development proxy expects port 8000.

## API

Send JSON request bodies with `Content-Type: application/json`. Except for health, registration, and login, all endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/health` | `200`, `{"status":"ok"}` |
| POST | `/api/auth/register` | `201`, `{id, username}` |
| POST | `/api/auth/login` | `200`, `{token}` |
| GET | `/api/auth/me` | `200`, `{id, username}` |
| POST | `/api/auth/logout` | `204`; revokes the current token |
| GET | `/api/todos` | `200`, paginated tasks belonging to the current user |
| POST | `/api/todos` | `201`, created task |
| GET | `/api/todos/<id>` | `200`, task |
| PATCH | `/api/todos/<id>` | `200`, updated task |
| DELETE | `/api/todos/<id>` | `204` |

Registration and login take `{ "username": "alice", "password": "a-secure-password" }`. Usernames are trimmed, case-insensitively unique, and must contain 3–32 letters, numbers, dots, underscores, or hyphens. Passwords must contain 8–128 characters. Register first, then log in to obtain a token. Tokens expire after 30 days and survive server restarts. The browser stores its token in local storage; the database stores only a SHA-256 token hash and scrypt password hashes.

Each task contains `id`, `title`, `description`, `priority`, `due_date`, `completed`, `completed_at`, and `created_at`:

- `title`: required on creation; trimmed, 1–200 characters.
- `description`: optional string of at most 5,000 characters, or `null`; defaults to `""`.
- `priority`: `low`, `medium`, or `high`; defaults to `medium`.
- `due_date`: valid `YYYY-MM-DD` date, or `null`; defaults to `null`.
- `completed`: JSON boolean; defaults to `false`.
- `completed_at` and `created_at`: server-managed UTC ISO timestamps. `completed_at` is set when completing a task, preserved when it remains completed, and cleared when reopening it.

PATCH changes only supplied fields. Unknown or server-managed task fields are rejected.

### Listing and errors

`GET /api/todos` accepts optional `completed` (`true`/`false` or `1`/`0`), `priority`, `page` (default 1), and `page_size` (default 20, allowed range 1–100). Filters can be combined.

The response contains `items`, `total`, `page`, `page_size`, and `remaining`. `total` counts matching tasks; `remaining` counts matching tasks after the returned page. Pages beyond the end return an empty `items` array. Ordering is incomplete first, then due date ascending with undated tasks last, then newest creation first.

Errors have an `error` message and, for field validation, an `errors` object keyed by field name. Invalid input returns `400`, duplicate usernames return `409`, and missing, expired, or invalid credentials return `401`. Missing tasks and tasks owned by another user return `404` for reads, updates, and deletion.

## Verification

From the repository root after installing dependencies:

```sh
.venv/bin/ruff check backend
.venv/bin/python -m unittest backend.test_app -v
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
git diff --check
```

For browser tests, activate the Python environment, then run these commands from `frontend/`:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright builds the frontend and starts an isolated backend on port 8001 using `data/e2e` for storage. It tests desktop and mobile layouts, authentication, CRUD, validation, filtering, pagination, and completion persistence/rollback. Set `CHROMIUM_PATH` to use an existing Chromium executable instead of downloading one; provide any library/font environment variables that executable needs. Test data and failure traces are excluded from Git and Docker build contexts.

## Layout

- `backend/app.py`: Flask application, authentication, SQLite initialization, and todo API.
- `backend/test_app.py`: API unit tests using temporary databases.
- `frontend/src/`: React workspace, shared forms, API client, and Tailwind styling.
- `frontend/tests/`: Playwright browser tests.
- `frontend/dist/`: generated production frontend, served by Flask.
- `data/`: generated persistent SQLite data; never included in the image.

Runtime Python dependencies are hash-locked in `backend/requirements.lock` and installed directly with `--require-hashes`. Frontend dependencies are locked in `frontend/package-lock.json` and installed with `npm ci`. Update the corresponding lock file when changing dependencies.
