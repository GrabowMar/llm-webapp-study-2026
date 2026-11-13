import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, STATUSES, statusLabel } from "../api";
import {
  Alert,
  BreachBadge,
  Button,
  Card,
  FieldError,
  Label,
  Loading,
  PageHeading,
  Select,
  SeverityBadge,
  Spinner,
  StatusBadge,
  TextArea,
  TextInput,
} from "../components";
import type { Incident, TimelineEvent, TimelinePage } from "../types";
import type { Navigate } from "../App";

const EVENT_TYPES = ["note", "update", "action", "observation", "communication"] as const;

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export default function IncidentView({ id, navigate }: { id: number; navigate: Navigate }) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [eventType, setEventType] = useState<string>("note");
  const [eventErrors, setEventErrors] = useState<Record<string, string>>({});
  const [eventError, setEventError] = useState("");
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", service: "", severity: "", commander: "", impact_summary: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadIncident = useCallback(async () => {
    const data = await api.getIncident(id);
    setIncident(data);
    setEditForm({
      title: data.title,
      service: data.service,
      severity: data.severity,
      commander: data.commander,
      impact_summary: data.impact_summary,
    });
    return data;
  }, [id]);

  const loadTimeline = useCallback(async () => {
    const data: TimelinePage = await api.getTimeline(id);
    setTimeline(data.items);
  }, [id]);

  useEffect(() => {
    let active = true;
    setIncident(null);
    setTimeline([]);
    setLoadError("");
    Promise.all([loadIncident(), loadTimeline()])
      .then(() => { if (active) setLoadError(""); })
      .catch((err) => {
        if (active) setLoadError(err instanceof ApiError ? err.message : "Failed to load incident.");
      });
    return () => { active = false; };
  }, [loadIncident, loadTimeline]);

  async function changeStatus(next: string) {
    if (!incident || next === incident.status) return;
    setStatusBusy(next);
    setStatusError("");
    try {
      const updated = await api.patchIncident(id, { status: next });
      setIncident(updated);
      await loadTimeline();
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : "Failed to update status.");
    } finally {
      setStatusBusy(null);
    }
  }

  async function postEvent(event: React.FormEvent) {
    event.preventDefault();
    setEventError("");
    setEventErrors({});
    setPosting(true);
    try {
      await api.postTimeline(id, { message, type: eventType });
      setMessage("");
      setEventType("note");
      await loadTimeline();
    } catch (err) {
      if (err instanceof ApiError) {
        setEventError(err.message);
        setEventErrors(err.errors);
      } else {
        setEventError("Failed to post event.");
      }
    } finally {
      setPosting(false);
    }
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    setEditError("");
    setEditErrors({});
    setSaving(true);
    try {
      const updated = await api.patchIncident(id, editForm);
      setIncident(updated);
      setEditing(false);
      await loadTimeline();
    } catch (err) {
      if (err instanceof ApiError) {
        setEditError(err.message);
        setEditErrors(err.errors);
      } else {
        setEditError("Failed to save changes.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <Button variant="secondary" onClick={() => navigate({ name: "incidents" })}>← Back to list</Button>
        <div className="mt-6"><Alert>{loadError}</Alert></div>
      </div>
    );
  }

  if (!incident) return <Loading label="Loading incident…" />;

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => navigate({ name: "incidents" })}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
        >
          ← Back to incidents
        </button>
      </div>

      <PageHeading
        title={incident.title}
        subtitle={`Incident #${incident.id} · ${incident.service || "No service"}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={incident.severity} />
        <StatusBadge status={incident.status} />
        {incident.sla_breached && <BreachBadge />}
        {incident.reopen_count > 0 && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
            Reopened {incident.reopen_count}×
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Details</h2>
              {!editing && (
                <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setEditing(true)}>Edit fields</Button>
              )}
            </div>

            {editing ? (
              <form onSubmit={saveEdit} className="space-y-4" noValidate>
                {editError && <Alert>{editError}</Alert>}
                <div>
                  <Label htmlFor="edit-title">Title</Label>
                  <TextInput id="edit-title" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  <FieldError errors={editErrors} name="title" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="edit-service">Service</Label>
                    <TextInput id="edit-service" value={editForm.service} onChange={(e) => setEditForm({ ...editForm, service: e.target.value })} />
                    <FieldError errors={editErrors} name="service" />
                  </div>
                  <div>
                    <Label htmlFor="edit-severity">Severity</Label>
                    <Select id="edit-severity" value={editForm.severity} onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}>
                      {["sev1", "sev2", "sev3", "sev4"].map((s) => <option key={s} value={s}>SEV {s.replace("sev", "")}</option>)}
                    </Select>
                    <FieldError errors={editErrors} name="severity" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-commander">Commander</Label>
                  <TextInput id="edit-commander" value={editForm.commander} onChange={(e) => setEditForm({ ...editForm, commander: e.target.value })} />
                  <FieldError errors={editErrors} name="commander" />
                </div>
                <div>
                  <Label htmlFor="edit-impact">Impact summary</Label>
                  <TextArea id="edit-impact" rows={3} value={editForm.impact_summary} onChange={(e) => setEditForm({ ...editForm, impact_summary: e.target.value })} />
                  <FieldError errors={editErrors} name="impact_summary" />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={saving}>Save changes</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Detail label="Service"><span className="font-medium">{incident.service || "—"}</span></Detail>
                <Detail label="Severity"><SeverityBadge severity={incident.severity} /></Detail>
                <Detail label="Commander"><span className="font-medium">{incident.commander || "—"}</span></Detail>
                <Detail label="Opened by"><span className="font-medium">{incident.opened_by || "—"}</span></Detail>
                <Detail label="Opened at">{formatDate(incident.opened_at)}</Detail>
                <Detail label="Resolution target">
                  {formatDate(incident.sla_due_at)}
                  {incident.sla_breached && <span className="ml-2 text-xs font-semibold text-red-600">past due</span>}
                </Detail>
                <Detail label="Resolved at">{formatDate(incident.resolved_at)}</Detail>
                <Detail label="Reopen count">{incident.reopen_count}</Detail>
                <div className="sm:col-span-2">
                  <Detail label="Impact summary">
                    <p className="whitespace-pre-wrap">{incident.impact_summary || "—"}</p>
                  </Detail>
                </div>
              </dl>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-slate-900">Timeline</h2>
            <p className="mb-5 text-xs text-slate-500">Oldest first · Posting an event does not change the status.</p>

            {timeline.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No events yet. Add the first update below.</p>
            ) : (
              <ol className="relative space-y-5 border-l border-slate-200 pl-6">
                {timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[31px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500 ring-4 ring-white" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">{event.type}</span>
                      <span className="text-xs text-slate-400">{formatDate(event.created_at)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">{event.message}</p>
                    <p className="mt-1 text-xs text-slate-500">by <span className="font-semibold text-slate-700">{event.author}</span></p>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-slate-900">Post a timeline event</h2>
            <form onSubmit={postEvent} className="space-y-4" noValidate>
              {eventError && <Alert>{eventError}</Alert>}
              <div>
                <Label htmlFor="event-type">Event type</Label>
                <Select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
                  {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <FieldError errors={eventErrors} name="type" />
              </div>
              <div>
                <Label htmlFor="event-message">Message</Label>
                <TextArea
                  id="event-message"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What happened? What did you find or change?"
                />
                <FieldError errors={eventErrors} name="message" />
              </div>
              <Button type="submit" loading={posting}>Post event</Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 text-base font-semibold text-slate-900">Status</h2>
            <p className="mb-4 text-xs text-slate-500">Changing status appends a status_change event.</p>
            {statusError && <div className="mb-3"><Alert>{statusError}</Alert></div>}
            <div className="flex flex-col gap-2">
              {STATUSES.map((status) => {
                const isCurrent = incident.status === status;
                return (
                  <button
                    key={status}
                    onClick={() => changeStatus(status)}
                    disabled={isCurrent || statusBusy !== null}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${
                      isCurrent
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                    }`}
                  >
                    <span>{statusLabel(status)}</span>
                    {statusBusy === status ? <Spinner small /> : isCurrent ? <span className="text-xs">current</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Other statuses can be set through the API. Any signed-in member may update this incident.
            </p>
          </Card>

          <Card className="bg-slate-50">
            <h2 className="text-sm font-semibold text-slate-700">SLA</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Target</dt>
                <dd className="text-right font-medium text-slate-800">{formatDate(incident.sla_due_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Status</dt>
                <dd className="text-right font-medium">
                  {incident.sla_breached
                    ? <span className="text-red-600">Breached</span>
                    : <span className="text-emerald-600">On track</span>}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
