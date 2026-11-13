import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../api";
import type { Incident, Status, TimelineEvent } from "../types";
import { EVENT_TYPES, STATUSES } from "../types";
import {
  BreachBadge,
  Card,
  ErrorBanner,
  Field,
  FieldError,
  SeverityBadge,
  StatusBadge,
  formatTimestamp,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../ui";

const STATUS_BUTTON_STYLES: Record<Status, string> = {
  investigating: "border-red-300 text-red-700 hover:bg-red-50",
  identified: "border-amber-300 text-amber-700 hover:bg-amber-50",
  monitoring: "border-blue-300 text-blue-700 hover:bg-blue-50",
  resolved: "border-emerald-300 text-emerald-700 hover:bg-emerald-50",
};

export default function IncidentDetailPage() {
  const { id } = useParams();
  const incidentId = Number(id);

  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);

  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [message, setMessage] = useState("");
  const [postError, setPostError] = useState<ApiError | null>(null);
  const [posting, setPosting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [inc, timeline] = await Promise.all([
        api.getIncident(incidentId),
        api.getTimeline(incidentId),
      ]);
      setIncident(inc);
      setEvents(timeline.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load incident");
    }
  }, [incidentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function changeStatus(status: Status) {
    if (!incident || incident.status === status) return;
    setStatusBusy(status);
    setError(null);
    try {
      const updated = await api.updateIncident(incident.id, { status });
      setIncident(updated);
      const timeline = await api.getTimeline(incident.id);
      setEvents(timeline.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update status");
    } finally {
      setStatusBusy(null);
    }
  }

  async function postEvent(event: FormEvent) {
    event.preventDefault();
    if (!incident) return;
    setPosting(true);
    setPostError(null);
    try {
      await api.postTimelineEvent(incident.id, { type: eventType, message });
      setMessage("");
      const timeline = await api.getTimeline(incident.id);
      setEvents(timeline.items);
    } catch (err) {
      setPostError(err instanceof ApiError ? err : new ApiError(0, "Failed to post event"));
    } finally {
      setPosting(false);
    }
  }

  if (error && !incident) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <ErrorBanner message={error} />
        <Link to="/incidents" className={`${secondaryButtonClass} mt-4`}>
          Back to incidents
        </Link>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-sm text-slate-500">Loading incident...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link to="/incidents" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        &larr; Back to incidents
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{incident.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            {incident.sla_breached ? <BreachBadge /> : null}
            <span className="text-sm text-slate-500">#{incident.id}</span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Details</h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Service">{incident.service}</Field>
          <Field label="Commander">{incident.commander}</Field>
          <Field label="Opened by">{incident.opened_by}</Field>
          <Field label="Opened at">{formatTimestamp(incident.opened_at)}</Field>
          <Field label="Resolved at">{formatTimestamp(incident.resolved_at)}</Field>
          <Field label="Reopen count">{incident.reopen_count}</Field>
          <Field label={`Resolution target (${incident.severity})`}>{formatTimestamp(incident.sla_due_at)}</Field>
          <Field label="SLA breached">{incident.sla_breached ? "yes" : "no"}</Field>
        </dl>
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Impact summary</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">
            {incident.impact_summary ?? <span className="text-slate-400">-</span>}
          </p>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Update status</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              disabled={incident.status === status || statusBusy !== null}
              onClick={() => void changeStatus(status)}
              className={`inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                incident.status === status
                  ? "border-slate-900 bg-slate-900 text-white"
                  : STATUS_BUTTON_STYLES[status]
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Timeline</h2>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No timeline events yet.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {events.map((ev) => (
              <li key={ev.id} className="flex gap-3">
                <div
                  className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${
                    ev.type === "status_change" ? "bg-indigo-500" : "bg-slate-300"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        ev.type === "status_change"
                          ? "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
                          : "bg-slate-100 text-slate-700 ring-slate-500/20"
                      }`}
                    >
                      {ev.type}
                    </span>
                    <span className="text-xs text-slate-500">
                      {ev.author} - {formatTimestamp(ev.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{ev.message}</p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={postEvent} className="mt-6 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">Post timeline event</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-1">
              <label htmlFor="event-type" className="block text-sm font-medium text-slate-700">
                Type
              </label>
              <select
                id="event-type"
                className={`${inputClass} mt-1`}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="event-message" className="block text-sm font-medium text-slate-700">
                Message
              </label>
              <textarea
                id="event-message"
                className={`${inputClass} mt-1`}
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened?"
                required
              />
              <FieldError message={postError?.fields.message} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className={primaryButtonClass} disabled={posting}>
              {posting ? "Posting..." : "Post event"}
            </button>
            <ErrorBanner message={postError && !postError.fields.message ? postError.message : null} />
          </div>
        </form>
      </Card>
    </div>
  );
}
