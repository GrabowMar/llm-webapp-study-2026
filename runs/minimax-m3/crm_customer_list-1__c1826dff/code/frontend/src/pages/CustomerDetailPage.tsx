import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ApiError, api, type Customer, type Interaction } from "../api";
import AppShell from "../components/AppShell";
import { Alert, Button, SelectField, Spinner, TextAreaField, TextField } from "../components/ui";
import { formatDateTime, kindLabel, toLocalInputValue } from "../format";

const KINDS = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

const KIND_STYLES: Record<string, string> = {
  call: "bg-sky-100 text-sky-700",
  email: "bg-violet-100 text-violet-700",
  meeting: "bg-emerald-100 text-emerald-700",
};

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(customerId)) return;
    try {
      const [customerData, interactionData] = await Promise.all([
        api.getCustomer(customerId),
        api.listInteractions(customerId),
      ]);
      setCustomer(customerData);
      setInteractions(interactionData.items);
      setNotFound(false);
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 404) {
        setNotFound(true);
      } else {
        setLoadError("This customer could not be loaded. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  async function handleLogInteraction(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    if (!summary.trim()) {
      setFieldErrors({ summary: "Summary is required." });
      return;
    }
    setSaving(true);
    try {
      await api.createInteraction(customerId, {
        kind,
        summary: summary.trim(),
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      });
      setSummary("");
      setOccurredAt(toLocalInputValue(new Date()));
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFormError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setFormError("The interaction could not be saved. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!customer) return;
    const confirmed = window.confirm(
      `Delete ${customer.name}? The customer and its interaction log will be removed.`,
    );
    if (!confirmed) return;
    try {
      await api.deleteCustomer(customerId);
      navigate("/customers", { replace: true });
    } catch {
      setLoadError("The customer could not be deleted. Please try again.");
    }
  }

  if (loading) {
    return (
      <AppShell>
        <Spinner label="Loading customer" />
      </AppShell>
    );
  }

  if (notFound || !customer) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Alert tone="error">
            That customer does not exist. It may have been deleted by another team member.
          </Alert>
          <Link to="/customers" className="text-sm font-medium text-indigo-700 hover:underline">
            Back to the customer list
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <Link to="/customers" className="text-sm font-medium text-indigo-700 hover:underline">
            ← Back to customers
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{customer.name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {customer.company || "No company on file"} · {customer.interaction_count}{" "}
                {customer.interaction_count === 1 ? "interaction" : "interactions"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to={`/customers/${customer.id}/edit`}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Edit
              </Link>
              <Button variant="danger" onClick={() => void handleDelete()}>
                Delete
              </Button>
            </div>
          </div>
        </div>

        {loadError ? <Alert tone="error">{loadError}</Alert> : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Details
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Email</dt>
                <dd className="text-right font-medium text-slate-800">
                  {customer.email ? (
                    <a className="text-indigo-700 hover:underline" href={`mailto:${customer.email}`}>
                      {customer.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Phone</dt>
                <dd className="text-right font-medium text-slate-800">{customer.phone || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Company</dt>
                <dd className="text-right font-medium text-slate-800">{customer.company || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Last contacted</dt>
                <dd className="text-right font-medium text-slate-800">
                  {formatDateTime(customer.last_contacted_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Added</dt>
                <dd className="text-right font-medium text-slate-800">
                  {formatDateTime(customer.created_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                <dt className="text-slate-500">Notes</dt>
                <dd className="max-w-[60%] whitespace-pre-wrap text-right text-slate-700">
                  {customer.notes || "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Log an interaction
              </h2>
              <form className="mt-4 space-y-4" onSubmit={handleLogInteraction} noValidate>
                {formError ? <Alert tone="error">{formError}</Alert> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Kind"
                    name="kind"
                    value={kind}
                    onChange={setKind}
                    options={KINDS}
                    error={fieldErrors.kind}
                  />
                  <TextField
                    label="When"
                    name="occurred_at"
                    type="datetime-local"
                    value={occurredAt}
                    onChange={setOccurredAt}
                    error={fieldErrors.occurred_at}
                  />
                </div>
                <TextAreaField
                  label="Summary"
                  name="summary"
                  value={summary}
                  onChange={setSummary}
                  error={fieldErrors.summary}
                  placeholder="What was discussed?"
                  rows={3}
                  required
                />
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Log interaction"}
                </Button>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Interaction log
              </h2>
              {interactions.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  Nothing logged yet. The first call, email or meeting will show up here.
                </p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {interactions.map((interaction) => (
                    <li key={interaction.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            KIND_STYLES[interaction.kind.toLowerCase()] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {kindLabel(interaction.kind)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(interaction.occurred_at)}
                        </span>
                        <span className="text-xs text-slate-500">
                          · logged by {interaction.logged_by}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">
                        {interaction.summary || "No summary"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
