import { useEffect, useState } from "react";
import { api, errorMessage, type SubscriptionPage } from "../api";
import {
  ErrorNote,
  LoadingNote,
  StatusBadge,
  formatDate,
  formatMoney,
} from "../components";
import { navigate } from "../router";

const PAGE_SIZE = 10;

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "cancelled", label: "Cancelled" },
];

export default function SubscriptionsPage() {
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SubscriptionPage | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    api
      .listSubscriptions({ page: 1, page_size: 1000 })
      .then((result) => {
        if (cancelled) return;
        const unique = Array.from(
          new Set(result.items.map((item) => item.plan)),
        ).sort();
        setPlans(unique);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listSubscriptions({
        q: debouncedQuery,
        status,
        plan,
        page,
        page_size: PAGE_SIZE,
      })
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, status, plan, page]);

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = data?.items ?? [];
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Subscriptions
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Newest first. Select a row to view invoices and record collections.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div
            role="tablist"
            aria-label="Filter by status"
            className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
          >
            {STATUS_TABS.map((tab) => {
              const active = status === tab.value;
              return (
                <button
                  key={tab.value || "all"}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">Plan</span>
            <select
              value={plan}
              onChange={(event) => {
                setPlan(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">All plans</option>
              {plans.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-1 items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">Customer</span>
            <input
              type="search"
              value={query}
              placeholder="Search customers…"
              onChange={(event) => setQuery(event.target.value)}
              className="w-full min-w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 sm:max-w-56"
            />
          </label>
        </div>

        <ErrorNote message={error} />

        {loading && !data ? (
          <LoadingNote label="Loading subscriptions…" />
        ) : items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No subscriptions match the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Monthly</th>
                  <th className="px-4 py-3">Renewal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Failed</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/subscriptions/${item.id}`)}
                    className="cursor-pointer bg-white transition hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.customer_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.plan}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                      {formatMoney(item.monthly_amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(item.renewal_date)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {item.failed_payment_count}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(item.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
          <span className="tabular-nums">
            Showing {start}–{end} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="tabular-nums">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
