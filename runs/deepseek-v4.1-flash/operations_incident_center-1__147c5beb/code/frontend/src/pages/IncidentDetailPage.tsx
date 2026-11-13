import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createIncident,
  fetchIncident,
  fetchTimeline,
  postTimelineEvent,
  updateIncident,
} from "../api";
import { Link } from "../router";
import type { Incident, TimelineEvent } from "../types";
import {
  SEVERITIES,
  STATUSES,
  formatDate,
  humanStatus,
  severityBadge,
  statusBadge,
  Notice,
} from "../ui";

export function NewIncidentPage() {
  const [title, setTitle] = useState("");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("sev2");
  const [commander, setCommander] = useState("");
  const [impact, setImpact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const inputClass =
    "mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    setBusy(true);
    try {
      const incident = await createIncident({
        title,
        service,
        severity,
        commander: commander || null,
        impact_summary: impact || null,
      });
      window.history.pushState(null, "", `/incidents/${incident.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields);
      } else {
        setError("Unable to open the incident.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Open incident</h1>
      <form
        onSubmit={submit}
        className="mt-6 space-y-5 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200"
      >
        {error && <Notice tone="error">{error}</Notice>}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-slate-700">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          {fields.title && <p className="mt-1 text-sm text-red-600">{fields.title}</p>}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="service" className="block text-sm font-medium text-slate-700">
              Service
            </label>
            <input
              id="service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              className={inputClass}
            />
            {fields.service && (
              <p className="mt-1 text-sm text-red-600">{fields.service}</p>
            )}
          </div>
          <div>
            <label htmlFor="severity" className="block text-sm font-medium text-slate-700">
              Severity
            </label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className={inputClass}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {fields.severity && (
              <p className="mt-1 text-sm text-red-600">{fields.severity}</p>
            )}
          </div>
        </div>
        <div>
          <label htmlFor="commander" className="block text-sm font-medium text-slate-700">
            Commander
          </label>
          <input
            id="commander"
            value={commander}
            onChange={(e) => setCommander(e.target.value)}
            className={inputClass}
          />
          {fields.commander && (
            <p className="mt-1 text-sm text-red-600">{fields.commander}</p>
          )}
        </div>
        <div>
          <label htmlFor="impact" className="block text-sm font-medium text-slate-700">
            Impact summary
          </label>
          <textarea
            id="impact"
            rows={4}
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            className={inputClass}
          />
          {fields.impact_summary && (
            <p className="mt-1 text-sm text-red-600">{fields.impact_summary}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? "Opening…" : "Open incident"}
          </button>
          <Link to="/incidents" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export function IncidentDetailPage({ id }: { id: string }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [eventType, setEventType] = useState("comment");
  const [postError, setPostError] = useState<string | null>(null);
  const [postBusy, setPostBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [incidentData, timelineData] = await Promise.all([
        fetchIncident(id),
        fetchTimeline(id),
      ]);
      setIncident(incidentData);
      setEvents(timelineData.items);
      setError(null);
      setTimelineError(null);
    } catch {
      setError("Unable to load this incident.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: string) {
    if (!incident || incident.status === status) return;
    setStatusBusy(true);
    setError(null);
    try {
      const updated = await updateIncident(incident.id, { status });
      setIncident(updated);
      const timelineData = await fetchTimeline(incident.id);
      setEvents(timelineData.items);
    } catch {
      setError("Unable to update the status.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function submitEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!incident) return;
    setPostError(null);
    setPostBusy(true);
    try {
      await postTimelineEvent(incident.id, eventType, message);
      setMessage("");
      const timelineData = await fetchTimeline(incident.id);
      setEvents(timelineData.items);
      const refreshed = await fetchIncident(incident.id);
      setIncident(refreshed);
    } catch (err) {
      if (err instanceof ApiError) {
        setPostError(err.fields.message ?? err.message);
      } else {
        setPostError("Unable to post the event.");
      }
    } finally {
      setPostBusy(false);
    }
  }

  if (error && !incident) {
    return (
      <div>
        <Notice tone="error">{error}</Notice>
        <Link to="/incidents" className="mt-4 inline-block text-sm text-indigo-600">
          Back to incidents
        </Link>
      </div>
    );
  }

  if (!incident) {
    return <p className="text-sm text-slate-500">Loading incident…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/incidents" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
          ← All incidents
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">{incident.title}</h1>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase ring-1 ring-inset ${severityBadge(incident.severity)}`}
          >
            {incident.severity}
          </span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${statusBadge(incident.status)}`}
          >
            {humanStatus(incident.status)}
          </span>
          {incident.sla_breached && (
            <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-600/20">
              SLA breached
            </span>
          )}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Details
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Service" value={incident.service} />
              <Field label="Commander" value={incident.commander ?? "—"} />
              <Field label="Opened by" value={incident.opened_by} />
              <Field label="Opened" value={formatDate(incident.opened_at)} />
              <Field label="Resolution target" value={formatDate(incident.sla_due_at)} />
              <Field label="Resolved" value={formatDate(incident.resolved_at)} />
              <Field label="Reopen count" value={String(incident.reopen_count)} />
            </dl>
            <div className="mt-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Impact summary
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {incident.impact_summary || "—"}
              </dd>
            </div>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Timeline
            </h2>
            <ol className="mt-4 space-y-4">
              {events.length === 0 && (
                <li className="text-sm text-slate-500">No events yet.</li>
              )}
              {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        {humanStatus(event.type)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDate(event.created_at)} · {event.author}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {event.message}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {timelineError && (
              <div className="mt-4">
                <Notice tone="error">{timelineError}</Notice>
              </div>
            )}
          </div>

          <form
            onSubmit={submitEvent}
            className="space-y-3 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Post an event
            </h2>
            {postError && <Notice tone="error">{postError}</Notice>}
            <div>
              <label htmlFor="event-type" className="block text-sm font-medium text-slate-700">
                Type
              </label>
              <select
                id="event-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="mt-1 block w-full rounded-md border-0 bg-white py-2 pl-3 pr-8 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
              >
                {["comment", "note", "mitigation", "update", "root_cause"].map((t) => (
                  <option key={t} value={t}>
                    {humanStatus(t)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-message" className="block text-sm font-medium text-slate-700">
                Message
              </label>
              <textarea
                id="event-message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <button
              type="submit"
              disabled={postBusy}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
            >
              {postBusy ? "Posting…" : "Post event"}
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Change status
            </h2>
            <div className="mt-4 flex flex-col gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={statusBusy || incident.status === status}
                  onClick={() => changeStatus(status)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-inset disabled:cursor-not-allowed ${
                    incident.status === status
                      ? "bg-slate-100 text-slate-500 ring-slate-200"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {humanStatus(status)}
                  {incident.status === status ? " (current)" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}
