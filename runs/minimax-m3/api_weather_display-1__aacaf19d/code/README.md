# Weather Display

A small weather display: a Flask JSON API over a local SQLite store of weather
reports, plus a React (TypeScript) web frontend served by the same process.
The app never calls an outside weather service — it serves the reports it holds
itself. Anyone can look up a city; signed-in users maintain the reports and
every lookup is recorded.

## Run contract

- The app is built from `Dockerfile` in this directory and the container listens on port 8000.
- The API is served under `/api`. `GET /api/health` answers `{"status": "ok"}` once the app is ready.
- The backend also serves the frontend build at `/`.
- Persistent data lives in `./data` (relative to the working directory `/app`).

## Layout

- `backend/`: the Flask app (`backend/app.py`, served by gunicorn as `app:app`); dependencies in `backend/requirements.txt`.
  - `backend/store.py` — SQLite schema, queries and seeding.
  - `backend/security.py` — password hashing and token helpers.
- `frontend/`: a Vite project (React + TypeScript). `npm run build` writes `frontend/dist`, which the image copies next to the backend.
- `tests/test_api.py` — end-to-end checks for the API (`python -m unittest discover -s tests`).

Dependencies are pinned: `backend/requirements.lock` holds the resolved versions and is installed as a pip constraints file. The frontend uses `frontend/package-lock.json` (`npm ci`). When you change dependencies, update the lock file as well (or remove it).

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | `{"status": "ok"}` |
| `POST` | `/api/auth/register` | `{"username", "password"}` → `201` |
| `POST` | `/api/auth/login` | `{"username", "password"}` → `200 {"token": "..."}` |
| `GET` | `/api/auth/me` | the signed-in user, needs a token |
| `POST` | `/api/auth/logout` | drops the token |
| `GET` | `/api/weather` | `{"items", "total", "page", "page_size"}`, ordered by city name |
| `GET` | `/api/weather?city=…` | keeps only that city and records the lookup |
| `POST` | `/api/weather` | adds a report (needs a token) |
| `GET` | `/api/weather/{id}` | one report |
| `PUT` | `/api/weather/{id}` | replaces a report, omitted optional fields are cleared (needs a token) |
| `DELETE` | `/api/weather/{id}` | deletes a report (needs a token) |
| `GET` | `/api/weather/recent` | `{"items"}` — the most recent lookups, newest first |

Signed-in requests send `Authorization: Bearer <token>`; requests that need a
signed-in user answer `401` without a valid token.

A weather report is `{"id", "city", "country", "temperature_c", "condition",
"humidity", "wind_kph", "observed_at"}` and a lookup is `{"id", "city", "found",
"looked_up_at"}`. City names are unique ignoring case and `observed_at` is
always set by the server. On first start the store is seeded with sample reports
for six cities.

## Frontend

Registration and sign-in, a city search with a weather card, a Celsius/Fahrenheit
switch that converts the shown temperatures in the browser, the five most recent
lookups (clicking one repeats the search), and — for signed-in users — the list
of reports with add and edit forms that surface the API's validation messages,
plus delete after a confirmation. Styling is Tailwind CSS utility classes.

## Development

```bash
# backend
python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
.venv/bin/python backend/app.py            # http://localhost:8000

# frontend (proxies /api to localhost:8000)
cd frontend && npm ci && npm run dev
```
