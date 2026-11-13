import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  ApiError,
  type Incident,
  type Status,
  type TimelineEvent,
  type TimelineList,
} from "../api";
import { Link, navigate } from "../router";
import {
  BreachBadge,
  ErrorAlert,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  STATUSES,
  buttonPrimaryClass,
  buttonSecondaryClass,
  formatDate,
  inputClass,
} from "../ui";

interface Props {
  id: number;
}

export default function IncidentDetailPage({ id }: Props) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [eventType, setEventType] = useState("note");
  const [eventMessage, setEventMessage] = useState("");
  const [posting, setPosting] = useState(false);

  const loadTimeline = useCallback(async () => {
    try {
      const result = await api<TimelineList>(`/api/incidents/${id}/timeline`);
      setEvents(result.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login");
      }
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    api<Incident>(`/api/incidents/${id}`)
      .then((data) => {
        if (cancelled) return;
        setIncident(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 401) {
            navigate("/login");
            return;
          }
          if (err.status === 404) {
            setNotFound(true);
            return;
          }
          setError(err.message);
        }
      });
    loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [id, loadTimeline]);

  const changeStatus = async (status: Status) => {
    setActionError(null);
    try {
      const updated = await api<Incident>(`/api/incidents/${id}`, {
        method: "PATCH",
        body: { status },
      });
      setIncident(updated);
      await loadTimeline();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login");
        return;
      }
      setActionError((err as Error).message);
    }
  };

  const postEvent = async (event: FormEvent) => {
    event.preventDefault();
    if (!eventMessage.trim()) {
      setActionError("Write a message before posting.");
      return;
    }
    setPosting(true);
    setActionError(null);
    try {
      await api(`/api/incidents/${id}/timeline`, {
        method: "POST",
        body: { type: eventType, message: eventMessage },
      });
      setEventMessage("");
      await loadTimeline();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login");
        return;
      }
      setActionError((err as Error).message);
    } finally {
      setPosting(false);
    }
  };

  if (notFound) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <h1 className="text-xl font-bold text-slate-900">Incident not found</h1>
        <Link
          to="/incidents"
          className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Back to incidents
        </Link>
      </div>
    );
  }

  if (!incident) {
    return (
      <p className="text-sm text-slate-500">{error ?? "Loading incident…"}</p>
    );
  }

  return (
    <div>
      <PageHeader title={`#${incident.id} · ${incident.title}`}>
        <Link to="/incidents" className={buttonSecondaryClass}>
          All incidents
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
        <BreachBadge breached={incident.sla_breached} />
        {incident.reopen_count > 0 ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
            Reopened {incident.reopen_count}×
          </span>
        ) : null}
      </div>

      <ErrorAlert message={error} />
      <div className="mt-3">
        <ErrorAlert message={actionError} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Details
          </h2>
          <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Detail label="Service" value={incident.service || "—"} />
            <Detail label="Commander" value={incident.commander || "—"} />
            <Detail label="Opened" value={formatDate(incident.opened_at)} />
            <Detail label="Resolved" value={formatDate(incident.resolved_at)} />
            <Detail label="Opened by" value={incident.opened_by} />
            <Detail label="Reopen count" value={String(incident.reopen_count)} />
            <Detail label="Resolution target" value={formatDate(incident.sla_due_at)} />
            <Detail
              label="SLA"
              value={incident.sla_breached ? "Breached" : "Within target"}
            />
          </dl>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Impact summary
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {incident.impact_summary || "No impact summary recorded."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Update status
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Each change is recorded on the timeline.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {STATUSES.map((status) => {
              const current = status === incident.status;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={current}
                  onClick={() => changeStatus(status)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-semibold capitalize transition ${
                    current
                      ? "cursor-default bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200"
                      : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-300"
                  }`}
                >
                  {status}
                  {current ? " · current" : ""}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Timeline
          </h2>
          <ol className="mt-4 space-y-4">
            {events.map((event) => (
              <li key={event.id} className="relative border-l-2 border-slate-200 pl-4">
                <span
                  className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${
                    event.type === "status_change" ? "bg-blue-600" : "bg-slate-400"
                  }`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 ring-1 ring-inset ring-slate-200">
                    {event.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDate(event.created_at)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {event.message}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  — {event.author}
                </p>
              </li>
            ))}
            {events.length === 0 ? (
              <li className="text-sm text-slate-500">No timeline events yet.</li>
            ) : null}
          </ol>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Post an event
          </h2>
          <form onSubmit={postEvent} className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Type</span>
              <select
                className={inputClass}
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
              >
                <option value="note">note</option>
                <option value="investigation">investigation</option>
                <option value="mitigation">mitigation</option>
                <option value="monitoring">monitoring</option>
                <option value="customer_update">customer update</option>
                <option value="other">other</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Message
              </span>
              <textarea
                className={`${inputClass} min-h-[7rem]`}
                value={eventMessage}
                placeholder="What happened, what did you try?"
                onChange={(event) => setEventMessage(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className={`${buttonPrimaryClass} w-full`}
              disabled={posting}
            >
              {posting ? "Posting…" : "Post event"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  );
}
