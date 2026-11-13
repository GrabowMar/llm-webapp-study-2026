import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Link } from "../router";
import {
  BreachFlag,
  Card,
  ErrorBanner,
  SectionTitle,
  SeverityBadge,
  StatusBadge,
  buttonGhost,
  buttonPrimary,
  inputClass,
} from "../ui";
import {
  STATUSES,
  type Incident,
  type IncidentStatus,
  type TimelineEvent,
} from "../types";
import { formatDateTime, targetMinutes } from "../format";

export default function IncidentDetailPage({ id }: { id: number }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStatus, setBusyStatus] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const [incidentResponse, timeline] = await Promise.all([
        api.getIncident(id),
        api.listTimeline(id),
      ]);
      setIncident(incidentResponse);
      setEvents(timeline.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the incident");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: IncidentStatus) {
    if (!incident) return;
    setBusyStatus(status);
    setError(null);
    try {
      const updated = await api.updateIncident(incident.id, { status });
      setIncident(updated);
      const timeline = await api.listTimeline(incident.id);
      setEvents(timeline.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the status");
    } finally {
      setBusyStatus(null);
    }
  }

  async function postEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!incident) return;
    if (!message.trim()) {
      setPostError("Write a message before posting.");
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      await api.postTimelineEvent(incident.id, message.trim());
      setMessage("");
      const timeline = await api.listTimeline(incident.id);
      setEvents(timeline.items);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Could not post the event");
    } finally {
      setPosting(false);
    }
  }

  if (loading && !incident) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 text-slate-400 sm:px-6">
        Loading incident…
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <ErrorBanner message={error ?? "Incident not found"} />
        <Link to="/incidents" className={`${buttonGhost} mt-4`}>
          Back to incidents
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Link to="/incidents" className="text-sm text-slate-400 hover:text-slate-200">
        ← Back to incidents
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <BreachFlag breached={incident.sla_breached} />
          </div>
          <h1 className="mt-3 text-3xl font-bold text-slate-50">{incident.title}</h1>
          <p className="mt-1 text-sm text-slate-400">
            Incident #{incident.id}
            {incident.service ? ` · ${incident.service}` : ""}
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <SectionTitle>Details</SectionTitle>
          <dl className="mt-4 space-y-3 text-sm">
            <Detail label="Service" value={incident.service || "—"} />
            <Detail label="Severity" value={incident.severity} />
            <Detail label="Status" value={incident.status} />
            <Detail label="Commander" value={incident.commander || "—"} />
            <Detail label="Opened by" value={incident.opened_by || "—"} />
            <Detail label="Opened at" value={formatDateTime(incident.opened_at)} />
            <Detail
              label="Resolution target"
              value={`${targetMinutes(incident.severity)} minutes`}
            />
            <Detail label="Target due" value={formatDateTime(incident.sla_due_at)} />
            <Detail label="Resolved at" value={formatDateTime(incident.resolved_at)} />
            <Detail label="Reopen count" value={String(incident.reopen_count)} />
          </dl>
          <div className="mt-5 border-t border-slate-800 pt-4">
            <SectionTitle>Impact summary</SectionTitle>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-300">
              {incident.impact_summary || "No impact summary recorded."}
            </p>
          </div>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle>Update status</SectionTitle>
            <div className="mt-3 flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => void changeStatus(status)}
                  disabled={busyStatus !== null || incident.status === status}
                  className={
                    incident.status === status
                      ? `${buttonPrimary} cursor-default`
                      : buttonGhost
                  }
                >
                  {busyStatus === status ? "Saving…" : status}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              A status change appends a <code>status_change</code> event to the timeline.
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle>Timeline</SectionTitle>
            {events.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No timeline events yet.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {events.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-800 px-2 py-0.5 font-semibold uppercase tracking-wide text-slate-300">
                        {item.type}
                      </span>
                      <span>{item.author || "system"}</span>
                      <span>·</span>
                      <span>{formatDateTime(item.created_at)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-200">
                      {item.message}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            <form className="mt-5 border-t border-slate-800 pt-4" onSubmit={postEvent}>
              <SectionTitle>Post an event</SectionTitle>
              {postError ? (
                <div className="mt-3">
                  <ErrorBanner message={postError} />
                </div>
              ) : null}
              <textarea
                className={`${inputClass} mt-3 min-h-24`}
                placeholder="What happened? This is appended to the timeline."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="mt-3 flex items-center gap-3">
                <button type="submit" className={buttonPrimary} disabled={posting}>
                  {posting ? "Posting…" : "Post event"}
                </button>
                <span className="text-xs text-slate-500">
                  Posting an event does not change the status.
                </span>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right capitalize text-slate-200">{value}</dd>
    </div>
  );
}
