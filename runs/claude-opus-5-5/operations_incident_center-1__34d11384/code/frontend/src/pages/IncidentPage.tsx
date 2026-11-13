import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  ApiError,
  EVENT_TYPES,
  SEVERITIES,
  STATUSES,
  type Incident,
  type Severity,
  type Status,
  type TimelineEvent,
} from "../api";
import {
  BreachedFlag,
  Card,
  ErrorBanner,
  FieldError,
  Link,
  SeverityBadge,
  StatusBadge,
  buttonClass,
  formatDate,
  inputClass,
  secondaryButtonClass,
} from "../ui";

const eventTypeStyles: Record<string, string> = {
  status_change: "bg-indigo-100 text-indigo-700",
  note: "bg-slate-100 text-slate-700",
  update: "bg-blue-100 text-blue-700",
  action: "bg-amber-100 text-amber-700",
  communication: "bg-green-100 text-green-700",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default function IncidentPage({ id }: { id: number }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: "", service: "", severity: "sev3" as Severity, commander: "", impact_summary: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const [message, setMessage] = useState("");
  const [eventType, setEventType] = useState<string>("note");
  const [eventErrors, setEventErrors] = useState<Record<string, string>>({});
  const [eventError, setEventError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [inc, tl] = await Promise.all([
        api<Incident>(`/incidents/${id}`),
        api<{ items: TimelineEvent[] }>(`/incidents/${id}/timeline`),
      ]);
      setIncident(inc);
      setEvents(tl.items);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(e instanceof ApiError ? e.message : "Could not load incident");
    }
  }, [id]);

  useEffect(() => {
    setIncident(null);
    setNotFound(false);
    load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const inc = await api<Incident>(`/incidents/${id}`, { method: "PATCH", body });
      setIncident(inc);
      const tl = await api<{ items: TimelineEvent[] }>(`/incidents/${id}/timeline`);
      setEvents(tl.items);
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setEditErrors(e.errors);
      } else setError("Network error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    if (!incident) return;
    setEdit({
      title: incident.title,
      service: incident.service,
      severity: incident.severity,
      commander: incident.commander ?? "",
      impact_summary: incident.impact_summary ?? "",
    });
    setEditErrors({});
    setEditing(true);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!incident) return;
    const body: Record<string, unknown> = {};
    if (edit.title !== incident.title) body.title = edit.title;
    if (edit.service !== incident.service) body.service = edit.service;
    if (edit.severity !== incident.severity) body.severity = edit.severity;
    if (edit.commander !== (incident.commander ?? "")) body.commander = edit.commander.trim() ? edit.commander : null;
    if (edit.impact_summary !== (incident.impact_summary ?? ""))
      body.impact_summary = edit.impact_summary.trim() ? edit.impact_summary : null;
    setEditErrors({});
    if (Object.keys(body).length === 0 || (await patch(body))) setEditing(false);
  }

  async function postEvent(e: FormEvent) {
    e.preventDefault();
    setEventError(null);
    setEventErrors({});
    try {
      const ev = await api<TimelineEvent>(`/incidents/${id}/timeline`, {
        method: "POST",
        body: { message, type: eventType },
      });
      setEvents((prev) => [...prev, ev]);
      setMessage("");
    } catch (err) {
      if (err instanceof ApiError) {
        setEventError(err.message);
        setEventErrors(err.errors);
      } else setEventError("Network error");
    }
  }

  if (notFound)
    return (
      <Card>
        <p className="text-slate-700">Incident #{id} was not found.</p>
        <Link href="/incidents" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
          ← Back to incidents
        </Link>
      </Card>
    );

  if (!incident)
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        {!error && <p className="text-slate-500">Loading…</p>}
      </div>
    );

  return (
    <div className="space-y-6">
      <Link href="/incidents" className="text-sm text-indigo-600 hover:underline">
        ← Back to incidents
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400">#{incident.id}</span>
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {incident.sla_breached && <BreachedFlag />}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{incident.title}</h1>
        </div>
        {!editing && (
          <button type="button" className={secondaryButtonClass} onClick={startEdit}>
            Edit details
          </button>
        )}
      </div>

      <ErrorBanner message={error} />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Status</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Change status">
          {STATUSES.map((s: Status) => {
            const current = s === incident.status;
            return (
              <button
                key={s}
                type="button"
                disabled={busy || current}
                aria-pressed={current}
                onClick={() => patch({ status: s })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ring-1 ring-inset ${
                  current
                    ? "bg-indigo-600 text-white ring-indigo-600"
                    : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
                }`}
              >
                {s === "resolved" && incident.status !== "resolved"
                  ? "Resolve"
                  : incident.status === "resolved" && s !== "resolved"
                    ? `Reopen as ${s}`
                    : s}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        {editing ? (
          <form onSubmit={saveEdit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="edit-title" className="mb-1 block text-sm font-medium text-slate-700">
                Title
              </label>
              <input
                id="edit-title"
                className={inputClass}
                value={edit.title}
                onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              />
              <FieldError message={editErrors.title} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="edit-service" className="mb-1 block text-sm font-medium text-slate-700">
                  Service
                </label>
                <input
                  id="edit-service"
                  className={inputClass}
                  value={edit.service}
                  onChange={(e) => setEdit({ ...edit, service: e.target.value })}
                />
                <FieldError message={editErrors.service} />
              </div>
              <div>
                <label htmlFor="edit-severity" className="mb-1 block text-sm font-medium text-slate-700">
                  Severity
                </label>
                <select
                  id="edit-severity"
                  className={inputClass}
                  value={edit.severity}
                  onChange={(e) => setEdit({ ...edit, severity: e.target.value as Severity })}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <FieldError message={editErrors.severity} />
              </div>
              <div>
                <label htmlFor="edit-commander" className="mb-1 block text-sm font-medium text-slate-700">
                  Commander
                </label>
                <input
                  id="edit-commander"
                  className={inputClass}
                  value={edit.commander}
                  onChange={(e) => setEdit({ ...edit, commander: e.target.value })}
                />
                <FieldError message={editErrors.commander} />
              </div>
            </div>
            <div>
              <label htmlFor="edit-impact" className="mb-1 block text-sm font-medium text-slate-700">
                Impact summary
              </label>
              <textarea
                id="edit-impact"
                rows={3}
                className={inputClass}
                value={edit.impact_summary}
                onChange={(e) => setEdit({ ...edit, impact_summary: e.target.value })}
              />
              <FieldError message={editErrors.impact_summary} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondaryButtonClass} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" className={buttonClass} disabled={busy}>
                Save
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <Field label="Service">{incident.service}</Field>
            <Field label="Severity">
              <SeverityBadge severity={incident.severity} />
            </Field>
            <Field label="Status">
              <StatusBadge status={incident.status} />
            </Field>
            <Field label="Commander">{incident.commander || "—"}</Field>
            <Field label="Opened by">{incident.opened_by}</Field>
            <Field label="Opened at">{formatDate(incident.opened_at)}</Field>
            <Field label="Resolution target">
              <span className={incident.sla_breached ? "font-semibold text-red-700" : ""}>
                {formatDate(incident.sla_due_at)}
              </span>
              {incident.sla_breached && <span className="ml-2 text-xs font-semibold text-red-700">(breached)</span>}
            </Field>
            <Field label="Resolved at">{formatDate(incident.resolved_at)}</Field>
            <Field label="Reopened">
              {incident.reopen_count} time{incident.reopen_count === 1 ? "" : "s"}
            </Field>
            <div className="sm:col-span-3">
              <Field label="Impact summary">
                <p className="whitespace-pre-wrap">{incident.impact_summary || "—"}</p>
              </Field>
            </div>
          </dl>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Timeline</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">No events yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {events.map((ev) => (
              <li key={ev.id} className="relative">
                <span className="absolute top-1.5 -left-[29px] h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span
                    className={`rounded px-1.5 py-0.5 font-medium ${eventTypeStyles[ev.type] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {ev.type.replace("_", " ")}
                  </span>
                  <span className="font-medium text-slate-700">{ev.author}</span>
                  <span>{formatDate(ev.created_at)}</span>
                </div>
                <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{ev.message}</p>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={postEvent} className="mt-6 space-y-3 border-t border-slate-200 pt-4" noValidate>
          <h3 className="text-sm font-semibold text-slate-700">Post an event</h3>
          <ErrorBanner message={eventError} />
          <div className="flex flex-wrap gap-3">
            <div>
              <label htmlFor="event-type" className="sr-only">
                Event type
              </label>
              <select
                id="event-type"
                className={inputClass}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <FieldError message={eventErrors.type} />
            </div>
          </div>
          <div>
            <label htmlFor="event-message" className="sr-only">
              Message
            </label>
            <textarea
              id="event-message"
              rows={3}
              placeholder="What happened?"
              className={inputClass}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <FieldError message={eventErrors.message} />
          </div>
          <div className="flex justify-end">
            <button type="submit" className={buttonClass}>
              Post event
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
