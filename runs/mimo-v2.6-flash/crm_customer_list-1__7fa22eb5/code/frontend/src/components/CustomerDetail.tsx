import { useCallback, useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "../api";
import { navigate } from "../App";
import { formatDateTime, formatDate, localDateTimeValue } from "../format";
import type { Customer, CustomerPayload, Interaction, InteractionKind } from "../types";
import CustomerForm from "./CustomerForm";

const KINDS: InteractionKind[] = ["call", "email", "meeting"];

const KIND_STYLES: Record<string, string> = {
  call: "bg-sky-100 text-sky-700",
  email: "bg-violet-100 text-violet-700",
  meeting: "bg-emerald-100 text-emerald-700",
};

type Props = {
  id: number;
};

export default function CustomerDetail({ id }: Props) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [kind, setKind] = useState<InteractionKind>("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => localDateTimeValue());
  const [logError, setLogError] = useState<string | null>(null);
  const [logFieldErrors, setLogFieldErrors] = useState<Record<string, string>>({});
  const [logging, setLogging] = useState(false);

  const load = useCallback(async () => {
    try {
      const [customerResult, interactionResult] = await Promise.all([
        api<Customer>(`/api/customers/${id}`),
        api<{ items: Interaction[] }>(`/api/customers/${id}/interactions`),
      ]);
      setCustomer(customerResult);
      setInteractions(interactionResult.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    setCustomer(null);
    setInteractions([]);
    setEditing(false);
    void load();
  }, [load]);

  async function saveCustomer(payload: CustomerPayload) {
    const updated = await api<Customer>(`/api/customers/${id}`, {
      method: "PUT",
      body: payload,
    });
    setCustomer(updated);
    setEditing(false);
    setError(null);
  }

  async function removeCustomer() {
    setDeleting(true);
    try {
      await api(`/api/customers/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  async function logInteraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLogError(null);
    setLogFieldErrors({});
    setLogging(true);
    try {
      await api(`/api/customers/${id}/interactions`, {
        method: "POST",
        body: {
          kind,
          summary,
          occurred_at: occurredAt ? new Date(occurredAt).toISOString() : undefined,
        },
      });
      setSummary("");
      setOccurredAt(localDateTimeValue());
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setLogError(err.message);
        setLogFieldErrors(err.fieldErrors);
      } else {
        setLogError(errorMessage(err));
      }
    } finally {
      setLogging(false);
    }
  }

  if (error && !customer) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Back to customers
        </button>
      </div>
    );
  }

  if (!customer) {
    return <p className="text-sm text-slate-500">Loading customer…</p>;
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        ← All customers
      </button>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{customer.name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {customer.company ?? "No company"}
              {customer.phone ? ` · ${customer.phone}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={removeCustomer}
              disabled={deleting}
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>

        {editing ? (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <CustomerForm
              title="Edit customer"
              submitLabel="Save"
              customer={customer}
              onSubmit={saveCustomer}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <dl className="mt-6 grid gap-x-6 gap-y-4 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email</dt>
              <dd className="mt-1 break-all text-sm text-slate-700">
                <a href={`mailto:${customer.email}`} className="hover:text-indigo-600 hover:underline">
                  {customer.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
              <dd className="mt-1 text-sm text-slate-700">{customer.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Company
              </dt>
              <dd className="mt-1 text-sm text-slate-700">{customer.company ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Interactions
              </dt>
              <dd className="mt-1 text-sm text-slate-700">{customer.interaction_count}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Last contacted
              </dt>
              <dd className="mt-1 text-sm text-slate-700">
                {customer.last_contacted_at ? formatDate(customer.last_contacted_at) : "Never"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Added
              </dt>
              <dd className="mt-1 text-sm text-slate-700">{formatDate(customer.created_at)}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {customer.notes || "No notes yet."}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Interaction log</h2>
        <p className="mt-1 text-sm text-slate-500">
          Calls, emails and meetings logged by the team, newest first.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Logged by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {interactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No interactions logged yet.
                  </td>
                </tr>
              ) : (
                interactions.map((interaction) => (
                  <tr key={interaction.id}>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          KIND_STYLES[interaction.kind] ?? "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {interaction.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{interaction.summary}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(interaction.occurred_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{interaction.logged_by}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={logInteraction} className="mt-6 border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-900">Log interaction</h3>

          {logError && !Object.values(logFieldErrors).includes(logError) && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {logError}
            </div>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="interaction-kind" className="block text-sm font-medium text-slate-700">
                Kind
              </label>
              <select
                id="interaction-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as InteractionKind)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {KINDS.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
              {logFieldErrors.kind && (
                <p className="mt-1 text-xs text-red-600">{logFieldErrors.kind}</p>
              )}
            </div>
            <div>
              <label
                htmlFor="interaction-date"
                className="block text-sm font-medium text-slate-700"
              >
                Date
              </label>
              <input
                id="interaction-date"
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {logFieldErrors.occurred_at && (
                <p className="mt-1 text-xs text-red-600">{logFieldErrors.occurred_at}</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="interaction-summary"
                className="block text-sm font-medium text-slate-700"
              >
                Summary
              </label>
              <textarea
                id="interaction-summary"
                rows={2}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="What happened?"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {logFieldErrors.summary && (
                <p className="mt-1 text-xs text-red-600">{logFieldErrors.summary}</p>
              )}
            </div>
          </div>

          <div className="mt-3">
            <button
              type="submit"
              disabled={logging}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {logging ? "Logging…" : "Log interaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
