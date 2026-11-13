import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { Paged, Status, Subscription } from "../types";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past due" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_STYLES: Record<Status, string> = {
  trial: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  past_due: "bg-amber-100 text-amber-800",
  cancelled: "bg-slate-200 text-slate-700",
};

const STATUS_LABELS: Record<Status, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Past due",
  cancelled: "Cancelled",
};

const PAGE_SIZE = 10;

export function SubscriptionsPage({ navigate }: { navigate: (p: string) => void }) {
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Subscription> | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status, plan]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));

    api<Paged<Subscription>>(`/subscriptions?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, status, plan, page]);

  const loadPlans = () => {
    api<Paged<Subscription>>("/subscriptions?page=1&page_size=100")
      .then((res) => {
        const unique = Array.from(new Set(res.items.map((s) => s.plan))).sort();
        setPlans(unique);
      })
      .catch(() => {
        /* ignore */
      });
  };

  useEffect(loadPlans, []);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.page_size));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
          <p className="mt-1 text-sm text-slate-500">
            {data ? `${data.total} subscription${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {showCreate ? "Close" : "New subscription"}
        </button>
      </div>

      {showCreate && (
        <CreateSubscription
          onCreated={() => {
            setShowCreate(false);
            setPage(1);
            loadPlans();
            api<Paged<Subscription>>(
              `/subscriptions?page=1&page_size=${PAGE_SIZE}`,
            ).then(setData);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                status === tab.value
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search customer…"
          className="min-w-48 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Monthly</th>
              <th className="px-4 py-3">Renewal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Failures</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((sub) => (
              <tr
                key={sub.id}
                onClick={() => navigate(`/subscriptions/${sub.id}`)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  {sub.customer_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{sub.plan}</td>
                <td className="px-4 py-3 text-slate-600">
                  ${sub.monthly_amount.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-slate-600">{sub.renewal_date}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[sub.status]}`}
                  >
                    {STATUS_LABELS[sub.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{sub.failed_payment_count}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {loading ? "Loading…" : "No subscriptions match your filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          Page {data?.page ?? 1} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={(data?.page ?? 1) <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-100 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            disabled={(data?.page ?? 1) >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-100 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateSubscription({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({
    customer_name: "",
    plan: "basic",
    monthly_amount: "29",
    renewal_date: new Date().toISOString().slice(0, 10),
    status: "trial",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/subscriptions", {
        method: "POST",
        body: {
          ...form,
          monthly_amount: Number(form.monthly_amount),
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3"
    >
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Customer name</span>
        <input
          required
          value={form.customer_name}
          onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Plan</span>
        <input
          required
          value={form.plan}
          onChange={(e) => setForm({ ...form, plan: e.target.value })}
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Monthly amount</span>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          value={form.monthly_amount}
          onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })}
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Renewal date</span>
        <input
          required
          type="date"
          value={form.renewal_date}
          onChange={(e) => setForm({ ...form, renewal_date: e.target.value })}
          className={field}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          className={field}
        >
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="past_due">Past due</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create subscription"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{error}</p>}
    </form>
  );
}
