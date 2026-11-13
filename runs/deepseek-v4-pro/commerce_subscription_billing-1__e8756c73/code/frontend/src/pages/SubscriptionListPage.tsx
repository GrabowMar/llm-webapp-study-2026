import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  api,
  formatMoney,
  STATUS_OPTIONS,
  type Subscription,
  type SubscriptionList,
} from "../api";
import { StatusBadge } from "../Layout";

export default function SubscriptionListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<SubscriptionList | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const status = searchParams.get("status") ?? "";
  const plan = searchParams.get("plan") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "") next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };

  useEffect(() => {
    api
      .listSubscriptions({ q, status, plan, page, page_size: 10 })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [q, status, plan, page]);

  useEffect(() => {
    api
      .listSubscriptions({ page: 1, page_size: 100 })
      .then((d) =>
        setPlans(Array.from(new Set(d.items.map((s) => s.plan))).sort()),
      )
      .catch(() => {});
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Subscriptions</h1>
        <Link
          to="/subscriptions/new"
          className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New subscription
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-gray-300 bg-white p-1">
          <button
            onClick={() => setParam("status", "")}
            className={`rounded px-3 py-1 text-sm ${
              status === "" ? "bg-indigo-600 text-white" : "text-gray-600"
            }`}
          >
            All
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setParam("status", s)}
              className={`rounded px-3 py-1 text-sm ${
                status === s ? "bg-indigo-600 text-white" : "text-gray-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={plan}
          onChange={(e) => setParam("plan", e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Search customers…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {data && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Monthly amount</th>
                <th className="px-4 py-3">Renewal date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Failed payments</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.items.map((s: Subscription) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/subscriptions/${s.id}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {s.customer_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{s.plan}</td>
                  <td className="px-4 py-3">{formatMoney(s.monthly_amount)}</td>
                  <td className="px-4 py-3">{s.renewal_date}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3">{s.failed_payment_count}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No subscriptions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            {data.total} subscription{data.total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setParam("page", String(page - 1))}
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setParam("page", String(page + 1))}
              className="rounded-md border border-gray-300 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
