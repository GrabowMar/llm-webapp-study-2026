import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  deleteCustomer,
  getCustomer,
  listInteractions,
  logInteraction,
  type Customer,
  type Interaction,
} from "../api";
import {
  dangerButton,
  ErrorBanner,
  Field,
  formatDate,
  formatDateTime,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../ui";

export default function CustomerDetail() {
  const { id } = useParams() as { id: string };
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([getCustomer(id), listInteractions(id)]);
      setCustomer(c);
      setInteractions(i);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    setCustomer(null);
    load();
  }, [load]);

  async function remove() {
    setDeleting(true);
    try {
      await deleteCustomer(id);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
      setConfirming(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    setFieldErrors({});
    try {
      await logInteraction(id, {
        kind,
        summary,
        ...(when ? { occurred_at: new Date(when).toISOString() } : {}),
      });
      setSummary("");
      setWhen("");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) setFormError(err.message);
      } else {
        setFormError("Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!customer) {
    return error ? (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <Link to="/" className="text-indigo-600 hover:underline">
          Back to customers
        </Link>
      </div>
    ) : (
      <p className="text-slate-500">Loading...</p>
    );
  }

  const details: [string, string][] = [
    ["Email", customer.email],
    ["Phone", customer.phone ?? "-"],
    ["Company", customer.company ?? "-"],
    ["Last contacted", formatDate(customer.last_contacted_at)],
    ["Interactions", String(customer.interaction_count)],
  ];

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        &larr; All customers
      </Link>
      {error && <ErrorBanner message={error} />}
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
          <div className="flex gap-2">
            <Link to={`/customers/${customer.id}/edit`} className={secondaryButton}>
              Edit
            </Link>
            {confirming ? (
              <>
                <button className={dangerButton} onClick={remove} disabled={deleting}>
                  Confirm delete
                </button>
                <button className={secondaryButton} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className={dangerButton} onClick={() => setConfirming(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
        {confirming && (
          <p className="mt-3 text-sm text-red-700">
            This permanently deletes the customer and all of their interactions.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
        {customer.notes && (
          <div className="mt-4 text-sm">
            <div className="text-slate-500">Notes</div>
            <p className="whitespace-pre-wrap text-slate-900">{customer.notes}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Log an interaction</h2>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          {formError && <ErrorBanner message={formError} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kind" htmlFor="kind" error={fieldErrors.kind}>
              <select id="kind" className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
              </select>
            </Field>
            <Field label="When (optional, defaults to now)" htmlFor="when" error={fieldErrors.occurred_at}>
              <input id="when" type="datetime-local" className={inputClass} value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
          </div>
          <Field label="Summary" htmlFor="summary" error={fieldErrors.summary}>
            <textarea id="summary" rows={3} className={inputClass} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <button type="submit" className={primaryButton} disabled={busy}>
            Log interaction
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Interaction log</h2>
        {interactions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No interactions logged yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {interactions.map((i) => (
              <li key={i.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium capitalize text-indigo-700">
                    {i.kind}
                  </span>
                  <span>{formatDateTime(i.occurred_at)}</span>
                  <span>by {i.logged_by}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-900">{i.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
