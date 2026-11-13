import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  api,
  ApiError,
  formatDateTime,
  type Customer,
  type FieldErrors,
  type Interaction,
  type InteractionKind,
} from "../api";
import { Alert, Button, Card, Field, Link, Spinner, TextArea, TextInput, buttonClass, inputClass } from "../components/ui";
import { navigate } from "../router";

const KINDS: { value: InteractionKind; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

const kindStyles: Record<string, string> = {
  call: "bg-sky-50 text-sky-700 ring-sky-200",
  email: "bg-amber-50 text-amber-700 ring-amber-200",
  meeting: "bg-violet-50 text-violet-700 ring-violet-200",
};

function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export default function CustomerDetail({ id }: { id: number }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [kind, setKind] = useState<InteractionKind>("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(nowLocalInput);
  const [logError, setLogError] = useState("");
  const [logFieldErrors, setLogFieldErrors] = useState<FieldErrors>({});
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    const [c, i] = await Promise.all([api.getCustomer(id), api.listInteractions(id)]);
    setCustomer(c);
    setInteractions(i.items);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load customer.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteCustomer(id);
      navigate("/", true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete customer.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function logInteraction(e: FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLogError("");
    setLogFieldErrors({});
    try {
      const occurred = occurredAt ? new Date(occurredAt) : null;
      await api.createInteraction(id, {
        kind,
        summary,
        occurred_at: occurred && !Number.isNaN(occurred.getTime()) ? occurred.toISOString() : undefined,
      });
      setSummary("");
      setOccurredAt(nowLocalInput());
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setLogFieldErrors(err.errors);
        if (!Object.keys(err.errors).length) setLogError(err.message);
      } else {
        setLogError("Could not log the interaction.");
      }
    } finally {
      setLogging(false);
    }
  }

  if (loading) return <Spinner />;
  if (!customer)
    return (
      <div className="space-y-4">
        <Alert>{error || "Customer not found."}</Alert>
        <Link to="/" className={buttonClass("secondary")}>
          Back to customers
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to customers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{customer.name}</h1>
            {customer.company && <p className="mt-1 text-slate-500">{customer.company}</p>}
          </div>
          <div className="flex gap-2">
            <Link to={`/customers/${id}/edit`} className={buttonClass("secondary")}>
              Edit
            </Link>
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {confirmDelete && (
        <div className="rounded-md bg-red-50 p-4 ring-1 ring-inset ring-red-200" role="alertdialog" aria-labelledby="confirm-delete-title">
          <p id="confirm-delete-title" className="text-sm font-medium text-red-800">
            Delete {customer.name}? This also removes all {customer.interaction_count} logged interaction
            {customer.interaction_count === 1 ? "" : "s"} and cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="danger" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, delete"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <h2 className="text-base font-semibold text-slate-900">Details</h2>
          <dl className="mt-4 space-y-4">
            <Detail label="Email">
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="text-indigo-600 hover:underline">
                  {customer.email}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Phone">
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="text-indigo-600 hover:underline">
                  {customer.phone}
                </a>
              ) : (
                "—"
              )}
            </Detail>
            <Detail label="Company">{customer.company ?? "—"}</Detail>
            <Detail label="Last contacted">{formatDateTime(customer.last_contacted_at)}</Detail>
            <Detail label="Interactions">{customer.interaction_count}</Detail>
            <Detail label="Added">{formatDateTime(customer.created_at)}</Detail>
            <Detail label="Notes">
              {customer.notes ? <p className="whitespace-pre-wrap">{customer.notes}</p> : <span className="text-slate-400">No notes</span>}
            </Detail>
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-900">Log an interaction</h2>
            <form className="mt-4 space-y-4" onSubmit={logInteraction} noValidate>
              {logError && <Alert>{logError}</Alert>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kind" htmlFor="kind" error={logFieldErrors.kind}>
                  <select id="kind" value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)} className={inputClass(logFieldErrors.kind)}>
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="When" htmlFor="occurred_at" error={logFieldErrors.occurred_at}>
                  <TextInput
                    id="occurred_at"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    error={logFieldErrors.occurred_at}
                  />
                </Field>
              </div>
              <Field label="Summary" htmlFor="summary" error={logFieldErrors.summary}>
                <TextArea
                  id="summary"
                  rows={3}
                  placeholder="What was discussed?"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  error={logFieldErrors.summary}
                />
              </Field>
              <div className="flex justify-end">
                <Button type="submit" disabled={logging}>
                  {logging ? "Saving…" : "Log interaction"}
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">Interaction log</h2>
            </div>
            {interactions.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500">No interactions logged yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {interactions.map((i) => (
                  <li key={i.id} className="px-6 py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${kindStyles[i.kind] ?? "bg-slate-50 text-slate-700 ring-slate-200"}`}>
                        {i.kind}
                      </span>
                      <time dateTime={i.occurred_at} className="text-slate-600">
                        {formatDateTime(i.occurred_at)}
                      </time>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600">
                        logged by <span className="font-medium text-slate-800">{i.logged_by}</span>
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{i.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
