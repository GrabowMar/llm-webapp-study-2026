import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import type { Customer, CustomerInput, Interaction } from "../types";
import { navigate } from "../router";
import CustomerForm from "../components/CustomerForm";
import { ErrorBanner, Field, formatDate, inputClass, Kinds, Spinner } from "../ui";

export default function CustomerDetailScreen({ id }: { id: number }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [logError, setLogError] = useState<string | null>(null);
  const [logBusy, setLogBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([api.getCustomer(id), api.listInteractions(id)]);
      setCustomer(c);
      setInteractions(i.items);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setLoadError(err instanceof ApiError ? err.message : "Failed to load customer.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    refresh();
  }, [refresh]);

  async function handleSave(input: CustomerInput) {
    setBusy(true);
    setSaveError(null);
    try {
      const updated = await api.updateCustomer(id, input);
      setCustomer(updated);
      setEditing(false);
      return true;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save changes.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setSaveError(null);
    try {
      await api.deleteCustomer(id);
      navigate("/");
      return;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to delete customer.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLog(e: FormEvent) {
    e.preventDefault();
    setLogBusy(true);
    setLogError(null);
    try {
      await api.createInteraction(id, { kind, summary });
      setSummary("");
      await refresh();
    } catch (err) {
      setLogError(err instanceof ApiError ? err.message : "Failed to log interaction.");
    } finally {
      setLogBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading customer…" />;
  if (notFound)
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-slate-700">This customer no longer exists.</p>
        <button onClick={() => navigate("/")} className="mt-4 text-sm font-medium text-blue-600 hover:underline">
          Back to the directory
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/")}
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        ← Back to customers
      </button>

      {loadError && <ErrorBanner>{loadError}</ErrorBanner>}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{customer?.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {customer?.company ?? "No company"} · added {formatDate(customer?.created_at ?? null)}
                </p>
              </div>
              {!editing && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setEditing(true);
                      setSaveError(null);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {editing && customer ? (
              <div className="mt-5">
                <CustomerForm
                  initial={customer}
                  submitLabel="Save changes"
                  error={saveError}
                  busy={busy}
                  onSubmit={handleSave}
                  onCancel={() => {
                    setEditing(false);
                    setSaveError(null);
                  }}
                />
              </div>
            ) : (
              <dl className="mt-4 space-y-3 text-sm">
                <Detail label="Email" value={customer?.email} />
                <Detail label="Phone" value={customer?.phone} />
                <Detail label="Company" value={customer?.company} />
                <Detail label="Notes" value={customer?.notes} />
                <Detail label="Last contacted" value={formatDate(customer?.last_contacted_at ?? null)} />
                <Detail label="Interactions" value={String(customer?.interaction_count ?? 0)} />
              </dl>
            )}
          </div>

          {confirmDelete && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-800">
                Delete {customer?.name} and all of their logged interactions? This cannot be undone.
              </p>
              {saveError && !editing && <div className="mt-2"><ErrorBanner>{saveError}</ErrorBanner></div>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Log an interaction</h3>
            <form onSubmit={handleLog} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <Field label="Kind">
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                    className={inputClass}
                  >
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                  </select>
                </Field>
                <Field label="Summary *">
                  <input
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    required
                    placeholder="What happened?"
                    className={inputClass}
                  />
                </Field>
              </div>
              <ErrorBanner>{logError}</ErrorBanner>
              <button
                type="submit"
                disabled={logBusy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-60"
              >
                {logBusy ? "Logging…" : "Log interaction"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Interactions</h3>
            </div>
            {interactions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No interactions logged yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {interactions.map((i) => (
                  <li key={i.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Kinds kind={i.kind} />
                      <span className="text-xs text-slate-500">{formatDate(i.occurred_at)}</span>
                      <span className="ml-auto text-xs text-slate-500">
                        by <span className="font-medium text-slate-700">{i.logged_by}</span>
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-800">{i.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">{value || "—"}</dd>
    </div>
  );
}
