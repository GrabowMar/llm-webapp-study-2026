"""Domain logic for customers and interactions."""

from datetime import datetime, timezone
from typing import Optional

from db import get_db, utcnow

FIELD_LABELS = {
    "name": "Name",
    "email": "Email",
    "phone": "Phone",
    "company": "Company",
    "notes": "Notes",
}

CUSTOMER_COLUMNS = """
    c.id AS id,
    c.name AS name,
    c.email AS email,
    c.phone AS phone,
    c.company AS company,
    c.notes AS notes,
    c.created_at AS created_at,
    c.updated_at AS updated_at,
    (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id) AS interaction_count,
    (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_contacted_at
"""


def _text(data, key, errors, required=False):
    label = FIELD_LABELS[key]
    if key not in data:
        if required:
            errors[key] = f"{label} is required."
        return None
    value = data[key]
    if value is None:
        if required:
            errors[key] = f"{label} is required."
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        errors[key] = f"{label} must be text."
        return None
    text = str(value).strip()
    if not text:
        if required:
            errors[key] = f"{label} is required."
        return None
    return text


def email_in_use(email: str, exclude_id: Optional[int] = None) -> bool:
    sql = "SELECT id FROM customers WHERE email IS NOT NULL AND lower(email) = lower(?)"
    params = [email]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    return get_db().execute(sql, params).fetchone() is not None


def parse_customer_payload(data, exclude_id: Optional[int] = None):
    errors = {}
    values = {
        "name": _text(data, "name", errors, required=True),
        "email": _text(data, "email", errors),
        "phone": _text(data, "phone", errors),
        "company": _text(data, "company", errors),
        "notes": _text(data, "notes", errors),
    }
    email = values["email"]
    if email and not errors.get("email"):
        if email_in_use(email, exclude_id=exclude_id):
            errors["email"] = "A customer with this email already exists."
    return values, errors


def serialize_customer(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "company": row["company"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "interaction_count": row["interaction_count"],
        "last_contacted_at": row["last_contacted_at"],
    }


def fetch_customer(customer_id: int):
    return get_db().execute(
        f"SELECT {CUSTOMER_COLUMNS} FROM customers c WHERE c.id = ?", (customer_id,)
    ).fetchone()


def list_customers(query: str, company: str, page: int, page_size: int):
    where = []
    params = []
    if query:
        needle = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(
            "(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' "
            "OR c.company LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')"
        )
        params.extend([needle, needle, needle, needle])
    if company:
        where.append("lower(c.company) = lower(?)")
        params.append(company)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = get_db().execute(
        f"SELECT COUNT(*) AS n FROM customers c{clause}", params
    ).fetchone()["n"]
    rows = get_db().execute(
        f"SELECT {CUSTOMER_COLUMNS} FROM customers c{clause} "
        "ORDER BY c.name COLLATE NOCASE ASC, c.id ASC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return [serialize_customer(row) for row in rows], total


def list_companies():
    rows = get_db().execute(
        "SELECT DISTINCT company FROM customers "
        "WHERE company IS NOT NULL AND trim(company) != '' "
        "ORDER BY company COLLATE NOCASE ASC"
    ).fetchall()
    return [row["company"] for row in rows]


def parse_timestamp(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Timestamp must be a string.")
    text = value.strip()
    if not text:
        return None
    candidate = text
    if " " in candidate and "T" not in candidate:
        candidate = candidate.replace(" ", "T", 1)
    if candidate.endswith(("Z", "z")):
        candidate = candidate[:-1] + "+00:00"
    moment = datetime.fromisoformat(candidate)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"


def serialize_interaction(row) -> dict:
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by_username"],
        "logged_by_id": row["logged_by_id"],
    }


INTERACTION_SELECT = """
    SELECT i.id AS id,
           i.customer_id AS customer_id,
           i.kind AS kind,
           i.summary AS summary,
           i.occurred_at AS occurred_at,
           u.username AS logged_by_username,
           i.logged_by AS logged_by_id
    FROM interactions i
    JOIN users u ON u.id = i.logged_by
"""


def list_interactions(customer_id: int):
    rows = get_db().execute(
        INTERACTION_SELECT
        + " WHERE i.customer_id = ? ORDER BY i.occurred_at DESC, i.id DESC",
        (customer_id,),
    ).fetchall()
    return [serialize_interaction(row) for row in rows]


def create_interaction(customer_id: int, kind: str, summary: str, occurred_at: str, user_id: int):
    cursor = get_db().execute(
        "INSERT INTO interactions (customer_id, kind, summary, occurred_at, logged_by, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (customer_id, kind, summary, occurred_at, user_id, utcnow()),
    )
    row = get_db().execute(
        INTERACTION_SELECT + " WHERE i.id = ?", (cursor.lastrowid,)
    ).fetchone()
    return serialize_interaction(row)
