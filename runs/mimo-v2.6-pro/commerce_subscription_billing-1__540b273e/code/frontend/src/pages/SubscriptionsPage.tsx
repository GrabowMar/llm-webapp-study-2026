import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSubscriptions, type Subscription } from "../api";
import {
  buttonClass,
  formatDate,
  formatMoney,
  inputClass,
  STATUSES,
  STATUS_LABELS,
  StatusBadge,
} from "../ui";

const PAGE_SIZE = 10;

const TABS = [
  { key: "", label: "All" },
  { key: "trial", label: STATUS_LABELS.trial },
  { key: "active", label: STATUS_LABELS.active },
  { key: "past_due", label: STATUS_LABELS.past_due },
  { key: "cancelled", label: STATUS_LABELS.cancelled },
];

export default function SubscriptionsPage() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [plans, setPlans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listSubscriptions({
      q: query || undefined,
      status: statusFilter || undefined,
      plan: planFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setTotal(data.total);
        setPlans((prev) =>
          Array.from(new Set([...prev, ...data.items.map((s) => s.plan)])).sort(
            (a, b) => a.localeCompare(b),
          ),
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load subscriptions",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, statusFilter, planFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Search, filter, and manage customer subscriptions.
          </p>
        </div>
        <Link to="/subscriptions/new" className={buttonClass("primary")}>
          New subscription
        </Link>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          {TABS.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <input
            className={`${inputClass} max-w-xs`}
            placeholder="Search customers"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <select
            className={`${inputClass} max-w-[12rem]`}
            value={planFilter}
            onChange={(event) => {
              setPlanFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All plans</option>
            {plans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
          {loading ? (
            <span className="text-sm text-slate-500">Loading…</span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Monthly</th>
                <th className="px-4 py-3 font-medium">Renews</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Failed payments</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/subscriptions/${item.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      {item.customer_name}
                    </Link>
                    <div className="text-xs text-slate-400">
                      Created {formatDate(item.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{item.plan}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatMoney(item.monthly_amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatDate(item.renewal_date)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.failed_payment_count}
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-slate-500"
                  >
                    No subscriptions match your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-500">
            Showing {firstItem}–{lastItem} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonClass("secondary")}
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={buttonClass("secondary")}
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
