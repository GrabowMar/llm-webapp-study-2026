import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ApiError,
  api,
  type Incident,
  type IncidentStatus,
  type TimelineEvent,
} from "../api";
import { formatTime, timeUntil } from "../format";
import {
  BreachedBadge,
  FieldErrors,
  SeverityBadge,
  STATUSES,
  StatusBadge,
} from "../components/ui";

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [eventErrors, setEventErrors] = useState<Record<string, string> | null>(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([api.getIncident(id), api.getTimeline(id)])
      .then(([inc, tl]) => {
        setIncident(inc);
        setEvents(tl.items);
        setError(null);
      })
      .catch((e) => setError(e.message ?? "failed to load incident"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(status: IncidentStatus) {
    if (!incident || incident.status === status) return;
    try {
      const updated = await api.patchIncident(incident.id, { status });
      setIncident(updated);
      const tl = await api.getTimeline(incident.id);
      setEvents(tl.items);
    } catch (e) {
      setError((e as ApiError).message ?? "failed to update status");
    }
  }

  async function postEvent(ev: React.FormEvent) {
    ev.preventDefault();
    if (!id) return;
    setPosting(true);
    setEventErrors(null);
    try {
      await api.postEvent(id, message);
      setMessage("");
      const tl = await api.getTimeline(id);
      setEvents(tl.items);
    } catch (err) {
      const e = err as ApiError;
      setEventErrors(e.details ?? { message: e.message });
    } finally {
      setPosting(false);
    }
  }

  if (error && !incident) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <Link to="/incidents" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          ← Back to incidents
        </Link>
      </div>
    );
  }

  if (!incident) return <p className="text-gray-500">Loading incident…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/incidents" className="mb-4 inline-block text-sm text-indigo-600 hover:underline">
        ← All incidents
      </Link>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              #{incident.id} {incident.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              {incident.sla_breached && <BreachedBadge />}
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Service</dt>
            <dd className="text-gray-900">{incident.service || "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Commander</dt>
            <dd className="text-gray-900">{incident.commander || "—"}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Opened</dt>
            <dd className="text-gray-900">{formatTime(incident.opened_at)}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Opened by</dt>
            <dd className="text-gray-900">{incident.opened_by}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Resolved</dt>
            <dd className="text-gray-900">{formatTime(incident.resolved_at)}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Reopen count</dt>
            <dd className="text-gray-900">{incident.reopen_count}</dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">Resolution target</dt>
            <dd className={incident.sla_breached ? "font-semibold text-red-600" : "text-gray-900"}>
              {formatTime(incident.sla_due_at)}
              {incident.status !== "resolved" && (
                <span className="ml-2 text-xs text-gray-500">({timeUntil(incident.sla_due_at)})</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-b border-gray-100 pb-2">
            <dt className="font-medium text-gray-500">SLA breached</dt>
            <dd className="text-gray-900">{incident.sla_breached ? "Yes" : "No"}</dd>
          </div>
          {incident.impact_summary && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-gray-500">Impact summary</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-900">
                {incident.impact_summary}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Change status
          </h2>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={incident.status === s}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                  incident.status === s
                    ? "cursor-default border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {s.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
        <ol className="mt-4 space-y-3">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="rounded bg-indigo-100 px-2 py-0.5 font-semibold uppercase tracking-wide text-indigo-700">
                  {ev.type.replace("_", " ")}
                </span>
                <span>{formatTime(ev.created_at)}</span>
              </div>
              <p className="mt-1.5 text-sm text-gray-800">{ev.message}</p>
              <p className="mt-1 text-xs text-gray-500">by {ev.author}</p>
            </li>
          ))}
          {events.length === 0 && (
            <li className="py-4 text-center text-sm text-gray-500">No events yet.</li>
          )}
        </ol>

        <form onSubmit={postEvent} className="mt-6 border-t border-gray-100 pt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Post an update
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What changed?"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-2">
            <FieldErrors errors={eventErrors} />
          </div>
          <button
            type="submit"
            disabled={posting}
            className="mt-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {posting ? "Posting…" : "Post event"}
          </button>
        </form>
      </div>
    </div>
  );
}
