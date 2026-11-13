import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  getIncident,
  getTimeline,
  Incident,
  postTimeline,
  TimelineEvent,
  updateIncident,
} from "../api";
import { BreachedBadge, SeverityBadge, StatusBadge, formatDateTime } from "../components";

const STATUSES = ["investigating", "identified", "monitoring", "resolved"];

export default function IncidentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [posting, setPosting] = useState(false);

  function load() {
    if (!id) return;
    getIncident(id)
      .then(setIncident)
      .catch((e) => setError(e.message));
    getTimeline(id)
      .then((res) => setTimeline(res.items))
      .catch((e) => setError(e.message));
  }

  useEffect(load, [id]);

  async function handleStatusChange(status: string) {
    if (!id) return;
    setStatusError("");
    try {
      const updated = await updateIncident(id, { status });
      setIncident(updated);
      const res = await getTimeline(id);
      setTimeline(res.items);
    } catch (e) {
      setStatusError((e as Error).message);
    }
  }

  async function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!id || !message.trim()) return;
    setPosting(true);
    try {
      const event = await postTimeline(id, message.trim());
      setTimeline((prev) => [...prev, event]);
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPosting(false);
    }
  }

  if (error && !incident) {
    return (
      <div>
        <p className="text-red-600">{error}</p>
        <Link to="/incidents" className="text-blue-600 hover:underline">
          Back to incidents
        </Link>
      </div>
    );
  }

  if (!incident) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <Link to="/incidents" className="text-blue-600 hover:underline">
        ← Incidents
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{incident.title}</h1>
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
        {incident.sla_breached && <BreachedBadge />}
      </div>

      {error && <p className="mt-3 text-red-600">{error}</p>}
      {statusError && <p className="mt-3 text-red-600">{statusError}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <Field label="Service" value={incident.service} />
              <Field label="Commander" value={incident.commander} />
              <Field label="Opened by" value={incident.opened_by} />
              <Field label="Opened at" value={formatDateTime(incident.opened_at)} />
              <Field label="SLA due at" value={formatDateTime(incident.sla_due_at)} />
              <Field label="Resolved at" value={formatDateTime(incident.resolved_at)} />
              <Field label="Reopen count" value={String(incident.reopen_count)} />
              <Field label="Status" value={incident.status} />
            </dl>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700">Impact summary</h3>
              <p className="mt-1 text-slate-600">{incident.impact_summary}</p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Update status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={incident.status === s}
                  className={`rounded px-3 py-2 text-sm font-semibold capitalize disabled:cursor-not-allowed disabled:opacity-40 ${
                    incident.status === s
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Timeline</h2>
            <form onSubmit={handlePost} className="mb-4 space-y-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add an update…"
                rows={3}
                className="w-full rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={posting || !message.trim()}
                className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {posting ? "Posting…" : "Post update"}
              </button>
            </form>
            <ul className="space-y-3">
              {timeline.map((event) => (
                <li key={event.id} className="border-l-2 border-slate-200 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                      {event.type}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(event.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{event.message}</p>
                  <p className="text-xs text-slate-500">by {event.author}</p>
                </li>
              ))}
              {timeline.length === 0 && (
                <li className="text-sm text-slate-500">No events yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
