import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type Reservation = {
  id: number;
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: number;
  notes: string | null;
  created_at: string;
};

type Slot = { time: string; booked: number; remaining: number };

type Auth = { token: string; username: string } | null;

type ReservationForm = {
  name: string;
  email: string;
  date: string;
  time: string;
  party_size: string;
  notes: string;
};

const STORAGE_KEY = "reservations.auth";
const CAPACITY = 20;

function today(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyForm(date = today()): ReservationForm {
  return {
    name: "",
    email: "",
    date,
    time: "18:00",
    party_size: "2",
    notes: "",
  };
}

function formFromReservation(r: Reservation): ReservationForm {
  return {
    name: r.name,
    email: r.email,
    date: r.date,
    time: r.time,
    party_size: String(r.party_size),
    notes: r.notes ?? "",
  };
}

async function api<T>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("Could not reach the server. Please try again.");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200";
const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const primaryButton =
  "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton =
  "inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200";

function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  if (!children) return null;
  const styles =
    kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : kind === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-sky-200 bg-sky-50 text-sky-800";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

function AuthPanel({ onSignedIn }: { onSignedIn: (auth: Auth) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await api("/api/auth/register", {
          method: "POST",
          body: { username, password },
        });
        setMessage({ kind: "success", text: "Account created. You can sign in now." });
        setMode("login");
      } else {
        const result = await api<{ token: string }>("/api/auth/login", {
          method: "POST",
          body: { username, password },
        });
        onSignedIn({ token: result.token, username });
      }
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex gap-2 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setMessage(null);
          }}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
            mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setMessage(null);
          }}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
            mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="auth-username">
            Username
          </label>
          <input
            id="auth-username"
            className={inputClass}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            className={inputClass}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
          />
        </div>
        {message && <Alert kind={message.kind}>{message.text}</Alert>}
        <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </section>
  );
}

function ReservationFields({
  form,
  onChange,
}: {
  form: ReservationForm;
  onChange: (form: ReservationForm) => void;
}) {
  function update<K extends keyof ReservationForm>(key: K, value: ReservationForm[K]) {
    onChange({ ...form, [key]: value });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor="res-name">
          Name
        </label>
        <input
          id="res-name"
          className={inputClass}
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="res-email">
          Email
        </label>
        <input
          id="res-email"
          className={inputClass}
          type="email"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="res-date">
          Date
        </label>
        <input
          id="res-date"
          className={inputClass}
          type="date"
          value={form.date}
          onChange={(event) => update("date", event.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="res-time">
          Time
        </label>
        <input
          id="res-time"
          className={inputClass}
          type="time"
          value={form.time}
          onChange={(event) => update("time", event.target.value)}
          required
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="res-party">
          Party size
        </label>
        <input
          id="res-party"
          className={inputClass}
          type="number"
          min={1}
          max={CAPACITY}
          value={form.party_size}
          onChange={(event) => update("party_size", event.target.value)}
          required
        />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass} htmlFor="res-notes">
          Notes
        </label>
        <textarea
          id="res-notes"
          className={`${inputClass} min-h-20 resize-y`}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Allergies, celebration, seating preference…"
        />
      </div>
    </div>
  );
}

function AvailabilityPanel({ date, slots, loading }: { date: string; slots: Slot[]; loading: boolean }) {
  const booked = slots.reduce((sum, slot) => sum + slot.booked, 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Availability</h2>
          <p className="text-sm text-slate-500">Slots with bookings on {date || "the chosen day"}.</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
          {booked} guests booked
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading availability…</p>
      ) : slots.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No bookings for this day yet. Every slot has {CAPACITY} seats free.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((slot) => {
            const fill = Math.round((slot.booked / CAPACITY) * 100);
            return (
              <div key={slot.time} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-semibold text-slate-900">{slot.time}</span>
                  <span
                    className={`text-sm font-semibold ${
                      slot.remaining === 0
                        ? "text-rose-600"
                        : slot.remaining <= 5
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {slot.remaining === 0 ? "Full" : `${slot.remaining} left`}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      slot.remaining === 0 ? "bg-rose-500" : slot.remaining <= 5 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(fill, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {slot.booked} of {CAPACITY} seats booked
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ReservationsList({
  reservations,
  onEdit,
  onCancel,
  busyId,
}: {
  reservations: Reservation[];
  onEdit: (reservation: Reservation) => void;
  onCancel: (reservation: Reservation) => void;
  busyId: number | null;
}) {
  if (reservations.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        You have no reservations yet.
      </p>
    );
  }

  const grouped = reservations.reduce<Record<string, Reservation[]>>((groups, reservation) => {
    (groups[reservation.date] ??= []).push(reservation);
    return groups;
  }, {});

  return (
    <div className="space-y-6">
      {Object.keys(grouped)
        .sort()
        .map((date) => (
          <div key={date}>
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{date}</h3>
            <div className="space-y-2">
              {grouped[date].map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {reservation.time} · {reservation.name} · {reservation.party_size}{" "}
                      {reservation.party_size === 1 ? "guest" : "guests"}
                    </p>
                    <p className="truncate text-sm text-slate-500">{reservation.email}</p>
                    {reservation.notes && (
                      <p className="mt-1 text-sm text-slate-600">{reservation.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => onEdit(reservation)}
                      disabled={busyId === reservation.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={dangerButton}
                      onClick={() => onCancel(reservation)}
                      disabled={busyId === reservation.id}
                    >
                      {busyId === reservation.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

function AdminPanel({ auth, date, dayGuests }: { auth: Auth; date: string; dayGuests: number }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [date, pageSize]);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      date,
      page: String(page),
      page_size: String(pageSize),
    });
    api<{ items: Reservation[]; total: number; page: number; page_size: number }>(
      `/api/admin/reservations?${params}`,
      { token: auth.token },
    )
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, date, page, pageSize]);

  const pageGuests = items.reduce((sum, reservation) => sum + reservation.party_size, 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Admin · all reservations</h2>
          <p className="text-sm text-slate-500">Every reservation for {date}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {total} reservations
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            {dayGuests} guests booked · {pageGuests} on this page
          </span>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <p className="text-sm text-slate-500">Loading reservations…</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No reservations for this day.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Time</th>
                <th className="px-2 py-2">Guest</th>
                <th className="px-2 py-2">Party</th>
                <th className="px-2 py-2">Notes</th>
                <th className="px-2 py-2">Booked</th>
              </tr>
            </thead>
            <tbody>
              {items.map((reservation) => (
                <tr key={reservation.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-3 font-semibold text-slate-900">{reservation.time}</td>
                  <td className="px-2 py-3">
                    <p className="font-medium text-slate-800">{reservation.name}</p>
                    <p className="text-xs text-slate-500">{reservation.email}</p>
                  </td>
                  <td className="px-2 py-3 text-slate-700">{reservation.party_size}</td>
                  <td className="max-w-xs px-2 py-3 text-slate-600">{reservation.notes ?? "—"}</td>
                  <td className="px-2 py-3 text-xs text-slate-500">{reservation.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Rows
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1 || loading}
          >
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            disabled={page >= pages || loading}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [auth, setAuth] = useState<Auth>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as Auth;
      return parsed && typeof parsed.token === "string" ? parsed : null;
    } catch {
      return null;
    }
  });
  const isAdmin = auth?.username === "admin";

  const [day, setDay] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [bookingForm, setBookingForm] = useState<ReservationForm>(() => emptyForm());
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [editForm, setEditForm] = useState<ReservationForm>(() => emptyForm());
  const [editBusy, setEditBusy] = useState(false);
  const [editMessage, setEditMessage] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);

  function signIn(next: Auth) {
    setAuth(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
    setBookingForm(emptyForm(day));
    setEditing(null);
  }

  function signOut() {
    signIn(null);
    setReservations([]);
    setEditing(null);
  }

  const loadAvailability = useCallback(async (date: string) => {
    if (!date) {
      setSlots([]);
      return;
    }
    setAvailabilityLoading(true);
    setAvailabilityError(null);
    try {
      const result = await api<{ items: Slot[] }>(
        `/api/availability?date=${encodeURIComponent(date)}`,
      );
      setSlots(result.items);
    } catch (error) {
      setAvailabilityError((error as Error).message);
      setSlots([]);
    } finally {
      setAvailabilityLoading(false);
    }
  }, []);

  const loadReservations = useCallback(async () => {
    if (!auth) {
      setReservations([]);
      return;
    }
    setReservationsLoading(true);
    setReservationsError(null);
    try {
      const result = await api<{ items: Reservation[]; total: number }>("/api/reservations", {
        token: auth.token,
      });
      setReservations(result.items);
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("Authentication required")) {
        signOut();
      } else {
        setReservationsError(message);
      }
    } finally {
      setReservationsLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    loadAvailability(day);
  }, [day, loadAvailability]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    if (auth) setBookingForm((form) => ({ ...form, date: day }));
  }, [day, auth]);

  function setDayAndForm(date: string) {
    setDay(date);
    setBookingForm((form) => ({ ...form, date }));
  }

  async function createBooking(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setBookingBusy(true);
    setBookingMessage(null);
    try {
      await api<Reservation>("/api/reservations", {
        method: "POST",
        token: auth.token,
        body: {
          name: bookingForm.name,
          email: bookingForm.email,
          date: bookingForm.date,
          time: bookingForm.time,
          party_size: Number(bookingForm.party_size),
          notes: bookingForm.notes,
        },
      });
      setBookingMessage({ kind: "success", text: "Reservation booked." });
      setBookingForm((form) => ({ ...emptyForm(day), name: form.name, email: form.email }));
      await Promise.all([loadAvailability(day), loadReservations()]);
    } catch (error) {
      setBookingMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setBookingBusy(false);
    }
  }

  function startEdit(reservation: Reservation) {
    setEditing(reservation);
    setEditForm(formFromReservation(reservation));
    setEditMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!auth || !editing) return;
    setEditBusy(true);
    setEditMessage(null);
    try {
      const updated = await api<Reservation>(`/api/reservations/${editing.id}`, {
        method: "PUT",
        token: auth.token,
        body: {
          name: editForm.name,
          email: editForm.email,
          date: editForm.date,
          time: editForm.time,
          party_size: Number(editForm.party_size),
          notes: editForm.notes,
        },
      });
      setEditing(null);
      setEditMessage({ kind: "success", text: "Reservation updated." });
      await Promise.all([loadAvailability(updated.date), loadReservations()]);
    } catch (error) {
      setEditMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setEditBusy(false);
    }
  }

  async function cancelReservation(reservation: Reservation) {
    if (!auth) return;
    const confirmed = window.confirm(
      `Cancel the reservation for ${reservation.name} on ${reservation.date} at ${reservation.time}?`,
    );
    if (!confirmed) return;
    setBusyId(reservation.id);
    setReservationsError(null);
    try {
      await api<void>(`/api/reservations/${reservation.id}`, {
        method: "DELETE",
        token: auth.token,
      });
      if (editing?.id === reservation.id) setEditing(null);
      await Promise.all([loadAvailability(day), loadReservations()]);
    } catch (error) {
      setReservationsError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const dayGuestTotal = useMemo(() => slots.reduce((sum, slot) => sum + slot.booked, 0), [slots]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-lg font-black text-white">
              T
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Table reservations</h1>
              <p className="text-xs text-slate-500">Book a table, manage your plans.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {auth ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {auth.username}
                  {isAdmin ? " · admin" : ""}
                </span>
                <button type="button" className={secondaryButton} onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {!auth && (
          <div className="grid gap-6 lg:grid-cols-2">
            <AuthPanel onSignedIn={signIn} />
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Check a day</h2>
              <p className="mb-4 text-sm text-slate-500">
                Anyone can view how full each time slot is. Sign in to book.
              </p>
              <label className={labelClass} htmlFor="public-day">
                Date
              </label>
              <input
                id="public-day"
                type="date"
                className={inputClass}
                value={day}
                onChange={(event) => setDayAndForm(event.target.value)}
              />
              <div className="mt-4">
                {availabilityError && <Alert kind="error">{availabilityError}</Alert>}
                <div className="grid gap-2">
                  {availabilityLoading ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : slots.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      No bookings for this day yet — all slots are open.
                    </p>
                  ) : (
                    slots.map((slot) => (
                      <div
                        key={slot.time}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">{slot.time}</span>
                        <span className="text-slate-600">
                          {slot.booked}/{CAPACITY} booked · {slot.remaining} left
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        {auth && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Choose a day</h2>
                  <p className="text-sm text-slate-500">
                    {dayGuestTotal} guests booked{isAdmin ? " in total" : ""}.
                  </p>
                </div>
                <div className="w-full sm:w-56">
                  <label className={labelClass} htmlFor="day-picker">
                    Date
                  </label>
                  <input
                    id="day-picker"
                    type="date"
                    className={inputClass}
                    value={day}
                    onChange={(event) => setDayAndForm(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <AvailabilityPanel
              date={day}
              slots={slots}
              loading={availabilityLoading}
            />
            {availabilityError && <Alert kind="error">{availabilityError}</Alert>}

            {isAdmin && <AdminPanel auth={auth} date={day} dayGuests={dayGuestTotal} />}

            {!isAdmin && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="mb-1 text-lg font-semibold text-slate-900">
                    {editing ? `Edit reservation #${editing.id}` : "Book a table"}
                  </h2>
                  <p className="mb-4 text-sm text-slate-500">
                    Every time slot seats at most {CAPACITY} guests.
                  </p>
                  <form
                    onSubmit={editing ? saveEdit : createBooking}
                    className="space-y-4"
                  >
                    <ReservationFields
                      form={editing ? editForm : bookingForm}
                      onChange={editing ? setEditForm : setBookingForm}
                    />
                    {editing ? (
                      editMessage && <Alert kind={editMessage.kind}>{editMessage.text}</Alert>
                    ) : (
                      bookingMessage && (
                        <Alert kind={bookingMessage.kind}>{bookingMessage.text}</Alert>
                      )
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className={primaryButton} disabled={editing ? editBusy : bookingBusy}>
                        {editing
                          ? editBusy
                            ? "Saving…"
                            : "Save changes"
                          : bookingBusy
                            ? "Booking…"
                            : "Book table"}
                      </button>
                      {editing && (
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => {
                            setEditing(null);
                            setEditMessage(null);
                          }}
                        >
                          Stop editing
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Your reservations</h2>
                      <p className="text-sm text-slate-500">Earliest first, grouped by date.</p>
                    </div>
                    {reservationsLoading && <span className="text-xs text-slate-500">Loading…</span>}
                  </div>
                  {reservationsError && <Alert kind="error">{reservationsError}</Alert>}
                  <div className="mt-3">
                    <ReservationsList
                      reservations={reservations}
                      onEdit={startEdit}
                      onCancel={cancelReservation}
                      busyId={busyId}
                    />
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
