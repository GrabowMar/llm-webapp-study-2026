import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Customer, Interaction } from "../api";
import { api, extractErrors } from "../api";
import { formatDate, formatDateTime } from "../format";

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const customerId = Number(id);

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [deleting, setDeleting] = useState(false);

  function load() {
    api
      .getCustomer(customerId)
      .then(setCustomer)
      .catch(() => setError("Could not load customer."));
    api
      .listInteractions(customerId)
      .then((res) => setInteractions(res.items))
      .catch(() => {});
  }

  useEffect(() => {
    load();
  }, [customerId]);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErrors({});
    try {
      await api.createInteraction(customerId, {
        kind,
        summary,
        occurred_at: occurredAt || undefined,
      });
      setSummary("");
      setOccurredAt("");
      load();
    } catch (err) {
      setFormErrors(extractErrors((err as { body?: unknown }).body));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this customer and all of their interactions?")) return;
    setDeleting(true);
    try {
      await api.deleteCustomer(customerId);
      navigate("/");
    } catch {
      setError("Could not delete customer.");
      setDeleting(false);
    }
  }

  if (error && !customer) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!customer) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link to="/" className="text-sm text-indigo-600 hover:underline">
            ← Back to customers
          </Link>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">{customer.name}</h2>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/customers/${customer.id}/edit`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-2">
        <Field label="Email" value={customer.email} />
        <Field label="Phone" value={customer.phone} />
        <Field label="Company" value={customer.company} />
        <Field label="Last contacted" value={formatDate(customer.last_contacted_at)} />
        <div className="sm:col-span-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
            {customer.notes ?? "—"}
          </p>
        </div>
      </div>

      <h3 className="mb-3 text-lg font-semibold text-slate-900">Interactions</h3>

      <form onSubmit={handleLog} className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
            {formErrors.kind && <p className="mt-1 text-sm text-red-600">{formErrors.kind}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Summary</label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              placeholder="What happened?"
            />
            {formErrors.summary && (
              <p className="mt-1 text-sm text-red-600">{formErrors.summary}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Date/time</label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Logging…" : "Log interaction"}
        </button>
      </form>

      {interactions.length === 0 ? (
        <p className="text-sm text-slate-500">No interactions logged yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {interactions.map((i) => (
            <li key={i.id} className="flex items-start gap-4 px-4 py-3">
              <span className="mt-0.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-600">
                {i.kind}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{i.summary}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDateTime(i.occurred_at)} · logged by {i.logged_by}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</h3>
      <p className="mt-1 text-sm text-slate-800">{value ?? "—"}</p>
    </div>
  );
}
