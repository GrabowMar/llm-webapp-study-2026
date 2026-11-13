import { useCallback, useEffect, useState } from "react";
import { ApiError, subscriptionsApi } from "./api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Spinner,
  inputClass,
} from "./components";
import {
  STATUSES,
  formatDate,
  formatMoney,
  statusLabel,
} from "./types";
import type { PagedSubscriptions, SubscriptionInput } from "./types";

const PAGE_SIZE = 10;

interface Filters {
  q: string;
  status: string;
  plan: string;
  page: number;
}

const emptyForm = {
  customer_name: "",
  plan: "",
  monthly_amount: "",
  renewal_date: "",
  status: "active",
};

export default function SubscriptionsView({
  onOpen,
}: {
  onOpen: (id: number) => void;
}) {
  const [filters, setFilters] = useState<Filters>({
    q: "",
    status: "",
    plan: "",
    page: 1,
  });
  const [data, setData] = useState<PagedSubscriptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await subscriptionsApi.list({
        q: filters.q,
        status: filters.status,
        plan: filters.plan,
        page: filters.page,
        page_size: PAGE_SIZE,
      });
      setData(result);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load subscriptions");
    } finally {
      setLoading(false);
    }
  }, [filters.q, filters.status, filters.plan, filters.page]);

  useEffect(() => {
    load();
  }, [load]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? Number(value) : 1 }));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    setSaving(true);
    const input: SubscriptionInput = {
      customer_name: form.customer_name.trim(),
      plan: form.plan.trim(),
      monthly_amount: form.monthly_amount === "" ? 0 : Number(form.monthly_amount),
      status: form.status,
    };
    if (form.renewal_date) input.renewal_date = form.renewal_date;
    try {
      await subscriptionsApi.create(input);
      setForm({ ...emptyForm });
      setShowCreate(false);
      setFilters((current) => ({ ...current, page: 1 }));
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create subscription");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Subscriptions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.total} subscription${data.total === 1 ? "" : "s"}` : "Manage billing"}
          </p>
        </div>
        <Button onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? "Cancel" : "+ New subscription"}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">
            New subscription
          </h2>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {formError && <Alert>{formError}</Alert>}
            <Field label="Customer name">
              <input
                className={inputClass}
                value={form.customer_name}
                onChange={(event) => setForm({ ...form, customer_name: event.target.value })}
                required
                placeholder="Acme Inc."
              />
            </Field>
            <Field label="Plan">
              <input
                className={inputClass}
                value={form.plan}
                onChange={(event) => setForm({ ...form, plan: event.target.value })}
                placeholder="pro"
              />
            </Field>
            <Field label="Monthly amount">
              <input
                className={inputClass}
                type="number"
                step="0.01"
                min="0"
                value={form.monthly_amount}
                onChange={(event) => setForm({ ...form, monthly_amount: event.target.value })}
                placeholder="29.00"
              />
            </Field>
            <Field label="Renewal date">
              <input
                className={inputClass}
                type="date"
                value={form.renewal_date}
                onChange={(event) => setForm({ ...form, renewal_date: event.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? "Creating…" : "Create subscription"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => updateFilter("status", "")}
          className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
            filters.status === ""
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          All
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            onClick={() => updateFilter("status", status)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
              filters.status === status
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {statusLabel(status)}
          </button>
        ))}
      </div>

      <Card className="p-0">
        <div className="flex flex-wrap gap-3 border-b border-slate-200 p-4">
          <input
            className={`${inputClass} sm:max-w-xs`}
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Search customers…"
            aria-label="Search customers"
          />
          <input
            className={`${inputClass} sm:max-w-[10rem]`}
            value={filters.plan}
            onChange={(event) => updateFilter("plan", event.target.value)}
            placeholder="Filter by plan…"
            aria-label="Filter by plan"
            list="plan-options"
          />
          <datalist id="plan-options">
            {Array.from(new Set(data?.items.map((item) => item.plan) ?? []))
              .filter(Boolean)
              .map((plan) => <option key={plan} value={plan} />)}
          </datalist>
          {(filters.q || filters.plan || filters.status) && (
            <Button
              variant="secondary"
              onClick={() => setFilters({ q: "", status: "", plan: "", page: 1 })}
            >
              Clear
            </Button>
          )}
        </div>

        {error && <div className="p-4"><Alert>{error}</Alert></div>}
        {loading && !data && <Spinner />}
        {data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3 text-right">Monthly</th>
                    <th className="px-4 py-3">Renewal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Failed runs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => onOpen(item.id)}
                      className="cursor-pointer transition hover:bg-indigo-50/60"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {item.customer_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.plan || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {formatMoney(item.monthly_amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(item.renewal_date)}
                      </td>
                      <td className="px-4 py-3"><Badge status={item.status} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {item.failed_payment_count}
                      </td>
                    </tr>
                  ))}
                  {data.items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        No subscriptions match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              <span>
                {data.total === 0
                  ? "No results"
                  : `Page ${data.page} of ${totalPages}`}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={data.page <= 1 || loading}
                  onClick={() => updateFilter("page", data.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={data.page >= totalPages || loading}
                  onClick={() => updateFilter("page", data.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
