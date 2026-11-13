# Base64

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and hashes and is installed directly with pip. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well.

## Development

Use Python 3.13 and Node 24. From the workspace root:

```sh
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.lock
backend/.venv/bin/gunicorn --bind 0.0.0.0:8000 --pythonpath backend app:app
```

In a separate terminal, from `frontend/`:

```sh
npm ci
npm run dev
```

Vite proxies `/api` to port 8000. Run `npm run build` in `frontend/` to build the frontend; Flask then serves that build on port 8000.

## Checks

From `frontend/`:

```sh
npm run lint
npm run typecheck
npm run build
```

From the workspace root:

```sh
backend/.venv/bin/python -m unittest discover -s backend -v
backend/.venv/bin/pip install ruff
backend/.venv/bin/ruff check backend
```

## API

All request bodies are JSON objects. Errors return `{"error": "message"}` with an appropriate HTTP status.

| Method | Endpoint | Body / behavior |
| --- | --- | --- |
| GET | `/api/health` | Returns `{"status": "ok"}` |
| POST | `/api/auth/register` | `{"username": "you", "password": "your-password"}`; creates an account (201) |
| POST | `/api/auth/login` | Same body; returns `{"token": "..."}` |
| GET | `/api/auth/me` | Returns the authenticated username |
| POST | `/api/auth/logout` | Invalidates the current token (204) |
| POST | `/api/base64/encode` | `{"text": "Hello"}`; returns `{"encoded": "SGVsbG8="}`; never saves |
| POST | `/api/base64/decode` | `{"encoded": "SGVsbG8="}`; returns `{"text": "Hello"}`; never saves |
| POST | `/api/conversions` | `{"direction": "encode", "input": "Hello"}`; converts, saves, and returns the conversion including full `output` (201) |
| GET | `/api/conversions?page=1&page_size=10` | Returns `items`, `total`, `page`, and `page_size`; newest first |
| DELETE | `/api/conversions/{id}` | Deletes an owned conversion (204), otherwise 404 |

Account and history requests require `Authorization: Bearer <token>`. Tokens expire after 30 days, are stored only as SHA-256 hashes on the server, and remain valid across restarts. Passwords use Werkzeug's scrypt hashing. Usernames are unique without regard to case.

Conversions contain `id`, `direction`, `input_preview`, `output_preview`, and UTC `created_at`. Previews are limited to 160 characters; only creation responses include the full output. Pagination defaults to page 1 with 10 items; `page_size` must be between 1 and 100.

Encoding accepts empty text and all valid UTF-8. Decoding requires canonical standard Base64 with padding, no whitespace, and valid UTF-8 decoded bytes. Base64 is not encryption. Request bodies are limited to 2 MiB.

SQLite data is stored in `./data/base64.sqlite3`. Mount `/app/data` as a persistent volume when running the image. Set `DATA_DIR` to override the data directory during local development or tests.

```sh
docker build -t base64 .
docker run --rm -p 8000:8000 -v base64-data:/app/data base64
```
