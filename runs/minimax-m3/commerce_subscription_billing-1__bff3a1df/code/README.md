# Subscription billing console

A small-team console for subscriptions, invoices and payment collection runs.
The backend is a Flask API under `/api`; the frontend is a React (TypeScript, Vite)
single page app served by the same process.

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

```bash
# backend
pip install -r backend/requirements.txt
python backend/app.py            # http://localhost:8000

# frontend
cd frontend
npm ci
npm run dev                      # proxies /api to http://localhost:8000
npm run build                    # writes frontend/dist
```

## Accounts

- `POST /api/auth/register` with `{"username": ..., "password": ...}` creates an account (201).
- `POST /api/auth/login` with the same body answers 200 with `{"token": "<token>"}`.
- Signed-in requests send the header `Authorization: Bearer <token>`.
- Endpoints that need a signed-in user answer `401` without a valid token.

Every signed-in team member may read and change every subscription. Visitors only
see the public summary.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | create an account |
| `POST` | `/api/auth/login` | exchange credentials for a token |
| `GET` | `/api/auth/me` | the signed-in account |
| `POST` | `/api/subscriptions` | create a subscription |
| `GET` | `/api/subscriptions` | paged list, newest first (`q`, `status`, `plan`, `page`, `page_size`) |
| `GET` | `/api/subscriptions/{id}` | one subscription |
| `PATCH` | `/api/subscriptions/{id}` | change only the given fields |
| `GET` | `/api/subscriptions/{id}/invoices` | invoice history, newest first |
| `POST` | `/api/subscriptions/{id}/invoices` | issue an open invoice |
| `POST` | `/api/subscriptions/{id}/collections` | record a `failed` or `succeeded` collection run |
| `GET` | `/api/subscriptions/plans` | distinct plan names (used by the plan filter) |
| `GET` | `/api/public/stats` | public summary: `mrr` and `counts` per status |

A subscription is returned as `id`, `customer_name`, `plan`, `monthly_amount`,
`renewal_date`, `status`, `failed_payment_count`, `created_at`. An invoice is
returned as `id`, `subscription_id`, `amount_due`, `due_date`, `status`, `paid_at`.
Money is always a number with at most two decimals.

Subscription statuses are `active`, `trial`, `past_due` and `cancelled`. MRR sums
`monthly_amount` over active and past-due subscriptions; trial and cancelled
subscriptions do not count.

A failed collection run increments `failed_payment_count` and moves the
subscription to `past_due`; a successful run pays every open invoice, resets the
failure count and moves a past-due subscription back to `active`.

## Frontend

- `/` — public summary with MRR and the number of subscriptions per status.
- `/login` — sign-in and registration.
- `/subscriptions` — table with status tabs, plan filter, customer search and paging.
- `/subscriptions/{id}` — edit form, invoice history, issue-invoice form and
  buttons recording failed or successful collection runs.
