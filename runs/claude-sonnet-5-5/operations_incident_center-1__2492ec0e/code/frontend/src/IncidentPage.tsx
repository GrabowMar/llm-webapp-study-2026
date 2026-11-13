import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, STATUSES, type Incident, type Status, type TimelineEvent } from "./api";
import {
  BreachedFlag,
  btnCls,
  btnSecondaryCls,
  ErrorBox,
  formatTime,
  inputCls,
  SeverityBadge,
  StatusBadge,
} from "./ui";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function IncidentPage({ id }: { id: number }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [msgError, setMsgError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, t] = await Promise.all([api.incident(id), api.timeline(id)]);
      setIncident(i);
      setEvents(t.items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setIncident(null);
    setEvents([]);
    load();
  }, [load]);

  async function changeStatus(status: Status) {
    setBusy(true);
    setActionError(null);
    try {
      await api.updateIncident(id, { status });
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function post(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsgError(null);
    try {
      await api.postEvent(id, message);
      setMessage("");
      await load();
    } catch (err) {
      setMsgError(err instanceof ApiError ? (err.fields.message ?? err.message) : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!incident) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          #{incident.id} {incident.title}
        </h1>
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
        {incident.sla_breached && <BreachedFlag />}
      </div>

      <section className="rounded-lg bg-white p-5 shadow">
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Item label="Service">{incident.service}</Item>
          <Item label="Commander">{incident.commander ?? "-"}</Item>
          <Item label="Opened by">{incident.opened_by}</Item>
          <Item label="Opened at">{formatTime(incident.opened_at)}</Item>
          <Item label="Resolution target">{formatTime(incident.sla_due_at)}</Item>
          <Item label="Resolved at">{formatTime(incident.resolved_at)}</Item>
          <Item label="Reopened">{incident.reopen_count} times</Item>
          <div className="col-span-2 md:col-span-3">
            <Item label="Impact summary">{incident.impact_summary ?? "-"}</Item>
          </div>
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Status</h2>
        {actionError && <ErrorBox>{actionError}</ErrorBox>}
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              className={s === incident.status ? btnCls : btnSecondaryCls}
              disabled={busy || s === incident.status}
              onClick={() => changeStatus(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Timeline</h2>
        <ol className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-lg bg-white p-3 shadow">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">{ev.type}</span>
                <span>{ev.author}</span>
                <span>{formatTime(ev.created_at)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{ev.message}</p>
            </li>
          ))}
          {events.length === 0 && <li className="text-sm text-slate-500">No events yet.</li>}
        </ol>
        <form onSubmit={post} className="space-y-2 rounded-lg bg-white p-4 shadow">
          {msgError && <ErrorBox>{msgError}</ErrorBox>}
          <textarea
            className={inputCls}
            rows={3}
            placeholder="Post an update..."
            aria-label="Event message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className={btnCls} disabled={busy}>
            Post event
          </button>
        </form>
      </section>
    </div>
  );
}
