import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, createInteraction, deleteCustomer, getCustomer, listInteractions } from "../api";
import type { Customer, Interaction, InteractionKind } from "../types";
import {
  Alert,
  Button,
  Card,
  Field,
  formatDate,
  KIND_LABELS,
  KIND_STYLES,
  Select,
  Spinner,
  TextArea,
  TextInput,
} from "../ui";

const KINDS: InteractionKind[] = ["call", "email", "meeting"];

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [kind, setKind] = useState<InteractionKind>("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<ApiError | null>(null);

  const reload = useCallback(() => {
    Promise.all([getCustomer(customerId), listInteractions(customerId)])
      .then(([c, i]) => {
        setCustomer(c);
        setInteractions(i.items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load customer");
        setLoading(false);
      });
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    reload();
  }, [reload]);

  async function handleDelete() {
    if (!window.confirm(`Delete ${customer?.name ?? "this customer"} and all their interactions?`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCustomer(customerId);
      navigate("/customers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete customer");
      setDeleting(false);
    }
  }

  async function handleLog(event: FormEvent) {
    event.preventDefault();
    setLogError(null);
    setLogging(true);
    try {
      await createInteraction(customerId, {
        kind,
        summary,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      });
      setSummary("");
      setOccurredAt("");
      reload();
    } catch (err) {
      setLogError(err instanceof ApiError ? err : new ApiError(0, "Failed to log interaction"));
    } finally {
      setLogging(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-6">
        <Link to="/customers" className="text-sm text-indigo-600 hover:underline">
          &larr; Back to customers
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{customer?.name}</h1>
            {customer?.company ? <p className="mt-1 text-slate-600">{customer.company}</p> : null}
          </div>
          <div className="flex items-center gap-3">
            <Link
              to={`/customers/${customerId}/edit`}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Edit
            </Link>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Details</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Email</dt>
              <dd className="mt-0.5 text-slate-900">
                {customer?.email ? (
                  <a href={`mailto:${customer.email}`} className="text-indigo-600 hover:underline">
                    {customer.email}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Phone</dt>
              <dd className="mt-0.5 text-slate-900">{customer?.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Company</dt>
              <dd className="mt-0.5 text-slate-900">{customer?.company ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">{customer?.notes ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Created</dt>
              <dd className="mt-0.5 text-slate-900">{formatDate(customer?.created_at, true)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Last contacted</dt>
              <dd className="mt-0.5 text-slate-900">{formatDate(customer?.last_contacted_at, true)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Log an interaction</h2>
          <p className="mt-1 text-sm text-slate-600">
            Record a call, email or meeting with {customer?.name}.
          </p>
          <form onSubmit={handleLog} className="mt-4 space-y-4">
            {logError ? <Alert>{logError.message}</Alert> : null}
            <Field label="Kind" error={logError?.fields.kind}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Summary" error={logError?.fields.summary}>
              <TextArea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="What happened?"
                required
              />
            </Field>
            <Field
              label="Occurred at"
              hint="Leave empty to use the current time."
              error={logError?.fields.occurred_at}
            >
              <TextInput
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={logging}>
              {logging ? "Logging…" : "Log interaction"}
            </Button>
          </form>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Interaction log ({interactions.length})
        </h2>
        {interactions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">
            No interactions logged yet. Use the form above to record the first one.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {interactions.map((interaction) => (
              <li key={interaction.id} className="flex flex-wrap items-start gap-4 py-4">
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${KIND_STYLES[interaction.kind] ?? "bg-slate-100 text-slate-700"}`}
                >
                  {KIND_LABELS[interaction.kind] ?? interaction.kind}
                </span>
                <div className="min-w-56 flex-1">
                  <p className="text-sm text-slate-900">{interaction.summary}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDate(interaction.occurred_at, true)} &middot; logged by{" "}
                    <span className="font-medium text-slate-700">{interaction.logged_by}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
