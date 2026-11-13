import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { formatDate, formatDateTime, toDateTimeInput, toIso } from "../format";
import {
  Alert,
  buttonDanger,
  buttonPrimary,
  buttonSecondary,
  FieldError,
  inputClass,
  labelClass,
} from "../ui";
import CustomerFormFields from "../components/CustomerFormFields";
import { Link, useNavigate } from "../router";
import type { Customer, CustomerInput, Interaction, InteractionList } from "../types";

const KINDS = ["call", "email", "meeting"];

function toInput(customer: Customer): CustomerInput {
  return {
    name: customer.name,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    company: customer.company ?? "",
    notes: customer.notes ?? "",
  };
}

export default function CustomerDetailPage({
  id,
  onSignedOut,
}: {
  id: number;
  onSignedOut: () => void;
}) {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<CustomerInput | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(toDateTimeInput(new Date().toISOString()));
  const [logErrors, setLogErrors] = useState<Record<string, string>>({});
  const [logError, setLogError] = useState("");
  const [logging, setLogging] = useState(false);

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
        return null;
      }
      if (err instanceof ApiError) return err;
      return new ApiError(0, fallback, {});
    },
    [onSignedOut],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [loadedCustomer, loadedInteractions] = await Promise.all([
        api<Customer>(`/customers/${id}`),
        api<InteractionList>(`/customers/${id}/interactions`),
      ]);
      setCustomer(loadedCustomer);
      setValues(toInput(loadedCustomer));
      setInteractions(loadedInteractions.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignedOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load the customer.");
    } finally {
      setLoading(false);
    }
  }, [id, onSignedOut]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!values) return;
    setSaving(true);
    setFieldErrors({});
    setFormError("");
    try {
      const updated = await api<Customer>(`/customers/${id}`, {
        method: "PUT",
        body: values,
      });
      setCustomer(updated);
      setValues(toInput(updated));
      setEditing(false);
    } catch (err) {
      const apiErr = handleError(err, "Could not save the customer.");
      if (apiErr) {
        setFieldErrors(apiErr.errors);
        setFormError(apiErr.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/customers/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      const apiErr = handleError(err, "Could not delete the customer.");
      if (apiErr) setError(apiErr.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function logInteraction(event: React.FormEvent) {
    event.preventDefault();
    setLogging(true);
    setLogErrors({});
    setLogError("");
    try {
      await api<Interaction>(`/customers/${id}/interactions`, {
        method: "POST",
        body: {
          kind,
          summary,
          occurred_at: toIso(occurredAt),
        },
      });
      setSummary("");
      setOccurredAt(toDateTimeInput(new Date().toISOString()));
      await load();
    } catch (err) {
      const apiErr = handleError(err, "Could not log the interaction.");
      if (apiErr) {
        setLogErrors(apiErr.errors);
        setLogError(apiErr.message);
      }
    } finally {
      setLogging(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-500 shadow-sm">
        Loading customer…
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <Alert>{error || "Customer not found."}</Alert>
        <Link to="/" className={buttonSecondary}>
          Back to directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm font-medium text-sky-600 hover:text-sky-700">
          ← Back to directory
        </Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
            <p className="mt-1 text-sm text-slate-600">
              {customer.company ?? "No company"} · Last contacted{" "}
              {formatDate(customer.last_contacted_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => {
                  setEditing(true);
                  setValues(toInput(customer));
                  setFieldErrors({});
                  setFormError("");
                }}
              >
                Edit
              </button>
            ) : null}
            {!confirmDelete ? (
              <button
                type="button"
                className={buttonDanger}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
                <span className="text-sm text-red-700">Delete this customer?</span>
                <button
                  type="button"
                  className={buttonDanger}
                  onClick={() => void remove()}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {editing && values ? (
          <form onSubmit={save} className="mt-6 space-y-5 border-t border-slate-100 pt-6" noValidate>
            {formError ? <Alert>{formError}</Alert> : null}
            <CustomerFormFields values={values} errors={fieldErrors} onChange={setValues} />
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className={buttonPrimary} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <dl className="mt-6 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <Detail label="Email" value={customer.email} />
            <Detail label="Phone" value={customer.phone} />
            <Detail label="Company" value={customer.company} />
            <Detail label="Created" value={formatDate(customer.created_at)} />
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {customer.notes || "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Interaction log</h2>
            <span className="text-sm text-slate-500">
              {interactions.length} entr{interactions.length === 1 ? "y" : "ies"}
            </span>
          </div>

          {interactions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No interactions logged yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {interactions.map((interaction) => (
                <li
                  key={interaction.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
                        {interaction.kind}
                      </span>
                      <span className="text-xs text-slate-500">
                        {formatDateTime(interaction.occurred_at)}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">
                      Logged by{" "}
                      <span className="font-medium text-slate-700">
                        {interaction.logged_by}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                    {interaction.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Log an interaction</h2>
          <form onSubmit={logInteraction} className="space-y-4" noValidate>
            {logError ? <Alert>{logError}</Alert> : null}

            <div>
              <label className={labelClass} htmlFor="kind">
                Kind
              </label>
              <select
                id="kind"
                className={inputClass}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {KINDS.map((option) => (
                  <option key={option} value={option}>
                    {option[0].toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
              <FieldError message={logErrors.kind} />
            </div>

            <div>
              <label className={labelClass} htmlFor="occurred_at">
                Date
              </label>
              <input
                id="occurred_at"
                type="datetime-local"
                className={inputClass}
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
              />
              <FieldError message={logErrors.occurred_at} />
            </div>

            <div>
              <label className={labelClass} htmlFor="summary">
                Summary
              </label>
              <textarea
                id="summary"
                className={`${inputClass} min-h-24 resize-y`}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="What happened?"
              />
              <FieldError message={logErrors.summary} />
            </div>

            <button type="submit" className={`${buttonPrimary} w-full`} disabled={logging}>
              {logging ? "Saving…" : "Log interaction"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-800">{value || "—"}</dd>
    </div>
  );
}
