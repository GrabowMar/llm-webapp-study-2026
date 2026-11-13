import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  apiCreateSubscription,
  apiPlans,
  apiSubscriptions,
} from "../api";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatMoney } from "../format";
import { STATUS_LABELS, STATUS_ORDER } from "../types";
import type { Subscription, SubscriptionPage, SubscriptionStatus } from "../types";

const TABS: { value: "" | SubscriptionStatus; label: string }[] = [
  { value: "", label: "All" },
  ...STATUS_ORDER.map((status) => ({ value: status as "" | SubscriptionStatus, label: STATUS_LABELS[status] })),
];

function defaultRenewalDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export default function SubscriptionsPage() {
  const [status, setStatus] = useState<"" | SubscriptionStatus>("");
  const [plan, setPlan] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<SubscriptionPage | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState("");
  const [newPlan, setNewPlan] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newRenewal, setNewRenewal] = useState(defaultRenewalDate);
  const [newStatus, setNewStatus] = useState<SubscriptionStatus>("active");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiPlans()
      .then((result) => {
        if (!cancelled) setPlans(result.items);
      })
      .catch(() => {
        /* the filter falls back to a free-text plan list */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(() => {
    setLoading(true);
    apiSubscriptions({ q: query, status, plan, page, pageSize })
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [query, status, plan, page, pageSize]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiCreateSubscription({
        customer_name: newCustomer.trim(),
        plan: newPlan.trim(),
        monthly_amount: Number(newAmount) || 0,
        renewal_date: newRenewal,
        status: newStatus,
      });
      setNewCustomer("");
      setNewPlan("");
      setNewAmount("");
      setNewRenewal(defaultRenewalDate());
      setNewStatus("active");
      setShowCreate(false);
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create the subscription");
    } finally {
      setCreating(false);
    }
  }

  const rows = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} subscription${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          {showCreate ? "Cancel" : "New subscription"}
        </button>
      </div>

      {showCreate ? (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold tracking-tight">Create a subscription</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="new-customer" className="block text-sm font-medium text-slate-700">
                Customer name
              </label>
              <input
                id="new-customer"
                required
                value={newCustomer}
                onChange={(event) => setNewCustomer(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label htmlFor="new-plan" className="block text-sm font-medium text-slate-700">
                Plan
              </label>
              <input
                id="new-plan"
                required
                list="known-plans"
                value={newPlan}
                onChange={(event) => setNewPlan(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="pro"
              />
              <datalist id="known-plans">
                {plans.map((known) => (
                  <option key={known} value={known} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="new-amount" className="block text-sm font-medium text-slate-700">
                Monthly amount
              </label>
              <input
                id="new-amount"
                required
                type="number"
                min="0"
                step="0.01"
                value={newAmount}
                onChange={(event) => setNewAmount(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="29.99"
              />
            </div>
            <div>
              <label htmlFor="new-renewal" className="block text-sm font-medium text-slate-700">
                Renewal date
              </label>
              <input
                id="new-renewal"
                required
                type="date"
                value={newRenewal}
                onChange={(event) => setNewRenewal(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label htmlFor="new-status" className="block text-sm font-medium text-slate-700">
                Status
              </label>
              <select
                id="new-status"
                value={newStatus}
                onChange={(event) => setNewStatus(event.target.value as SubscriptionStatus)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                {STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {createError ? (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {createError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={creating}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create subscription"}
          </button>
        </form>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  status === tab.value
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search customer…"
              aria-label="Search customer"
              className="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            <select
              value={plan}
              onChange={(event) => {
                setPlan(event.target.value);
                setPage(1);
              }}
              aria-label="Filter by plan"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All plans</option>
              {plans.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={String(pageSize)}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              aria-label="Rows per page"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <p className="border-b border-slate-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">MRR</th>
                <th scope="col" className="px-4 py-3 font-medium">Renews</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Failed</th>
                <th scope="col" className="px-4 py-3 font-medium">Created</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((subscription: Subscription) => (
                <tr key={subscription.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                    {subscription.customer_name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{subscription.plan}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                    {formatMoney(subscription.monthly_amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDate(subscription.renewal_date)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={subscription.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                    {subscription.failed_payment_count}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                    {formatDate(subscription.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      to={`/subscriptions/${subscription.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No subscriptions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm">
          <span className="text-slate-500">
            {data
              ? `Page ${data.page} of ${totalPages} · ${data.total} result${data.total === 1 ? "" : "s"}`
              : "—"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
