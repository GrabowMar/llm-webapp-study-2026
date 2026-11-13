import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, money, STATUSES, statusLabel } from "./api";
import type { Page, Status } from "./api";
import { Badge, btnCls, btnSecondaryCls, Card, ErrorMsg, Field, inputCls } from "./ui";

const PAGE_SIZE = 10;

function NewSubscription({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState("");
  const [renewal, setRenewal] = useState("");
  const [status, setStatus] = useState<Status>("trial");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("POST", "/subscriptions", {
        customer_name: name,
        plan,
        monthly_amount: Number(amount),
        renewal_date: renewal,
        status,
      });
      setName("");
      setPlan("");
      setAmount("");
      setRenewal("");
      setStatus("trial");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Card title="New subscription">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <Field label="Customer">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
        </div>
        <Field label="Plan">
          <input className={inputCls} value={plan} onChange={(e) => setPlan(e.target.value)} required />
        </Field>
        <Field label="Monthly amount">
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <Field label="Renewal date">
          <input
            className={inputCls}
            type="date"
            value={renewal}
            onChange={(e) => setRenewal(e.target.value)}
            required
          />
        </Field>
        <Field label="Status">
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-6 space-y-2">
          <ErrorMsg message={error} />
          <button className={btnCls} type="submit">
            Create subscription
          </button>
        </div>
      </form>
    </Card>
  );
}

export default function SubscriptionList({ onOpen }: { onOpen: (id: number) => void }) {
  const [status, setStatus] = useState<string>("");
  const [plan, setPlan] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const [planQ, setPlanQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setPlanQ(plan.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
    if (status) params.set("status", status);
    if (planQ) params.set("plan", planQ);
    if (q) params.set("q", q);
    api<Page>("GET", `/subscriptions?${params}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [status, planQ, q, page, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const tabs: [string, string][] = [["", "All"], ...STATUSES.map((s): [string, string] => [s, statusLabel(s)])];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Subscriptions</h1>
      <NewSubscription onCreated={() => (page === 1 ? setReload((n) => n + 1) : setPage(1))} />
      <Card>
        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-sm capitalize ${
                status === value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <input
            className={inputCls}
            placeholder="Search customer"
            aria-label="Search customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Filter by plan"
            aria-label="Plan filter"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          />
        </div>
        <ErrorMsg message={error} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Plan</th>
                <th className="py-2 pr-4">Monthly</th>
                <th className="py-2 pr-4">Renewal</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Failed payments</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4">
                    <button className="text-indigo-600 hover:underline" onClick={() => onOpen(s.id)}>
                      {s.customer_name}
                    </button>
                  </td>
                  <td className="py-2 pr-4">{s.plan}</td>
                  <td className="py-2 pr-4">{money(s.monthly_amount)}</td>
                  <td className="py-2 pr-4">{s.renewal_date}</td>
                  <td className="py-2 pr-4">
                    <Badge status={s.status} />
                  </td>
                  <td className="py-2 pr-4">{s.failed_payment_count}</td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No subscriptions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {data?.total ?? 0} total · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <button className={btnSecondaryCls} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button className={btnSecondaryCls} disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
