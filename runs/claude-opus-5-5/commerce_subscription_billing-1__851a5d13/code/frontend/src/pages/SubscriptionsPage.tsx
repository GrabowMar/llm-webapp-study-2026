import { useEffect, useState } from "react";
import type { Page, Status, Subscription } from "../api";
import { STATUSES, STATUS_LABELS, api, errorMessage, formatMoney } from "../api";
import { navigate } from "../router";
import { Alert, Button, Card, Field, Input, Link, Select, StatusBadge } from "../ui";

const PAGE_SIZE = 10;

function readParams(search: string) {
  const p = new URLSearchParams(search);
  const page = Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1);
  return { status: p.get("status") ?? "", plan: p.get("plan") ?? "", q: p.get("q") ?? "", page };
}

export default function SubscriptionsPage({ search }: { search: string }) {
  const params = readParams(search);
  const [data, setData] = useState<Page<Subscription> | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState(params.q);
  const [showCreate, setShowCreate] = useState(false);
  const [reload, setReload] = useState(0);

  function update(next: Partial<ReturnType<typeof readParams>>) {
    const merged = { ...params, page: 1, ...next };
    const p = new URLSearchParams();
    if (merged.status) p.set("status", merged.status);
    if (merged.plan) p.set("plan", merged.plan);
    if (merged.q) p.set("q", merged.q);
    if (merged.page > 1) p.set("page", String(merged.page));
    const qs = p.toString();
    navigate(`/subscriptions${qs ? `?${qs}` : ""}`, true);
  }

  useEffect(() => {
    setQuery(params.q);
  }, [params.q]);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(params.page), page_size: String(PAGE_SIZE) });
    if (params.status) p.set("status", params.status);
    if (params.plan) p.set("plan", params.plan);
    if (params.q) p.set("q", params.q);
    let cancelled = false;
    setLoading(true);
    api<Page<Subscription>>(`/subscriptions?${p}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [params.page, params.status, params.plan, params.q, reload]);

  useEffect(() => {
    api<{ items: string[] }>("/plans")
      .then((d) => setPlans(d.items))
      .catch(() => {});
  }, [reload]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (query.trim() !== params.q) update({ q: query.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const tabs: { key: string; label: string }[] = [{ key: "", label: "All" }, ...STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s] }))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Subscriptions</h1>
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? "Close" : "New subscription"}</Button>
      </div>

      {showCreate && (
        <CreateSubscription
          onCreated={(s) => {
            setShowCreate(false);
            navigate(`/subscriptions/${s.id}`);
          }}
        />
      )}

      <nav className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Status">
        {tabs.map((t) => {
          const active = params.status === t.key;
          return (
            <button
              key={t.key || "all"}
              role="tab"
              aria-selected={active}
              onClick={() => update({ status: t.key })}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                active ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Field label="Search customer">
            <Input type="search" placeholder="Customer name…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
        </div>
        <div className="w-full sm:w-48">
          <Field label="Plan">
            <Select value={params.plan} onChange={(e) => update({ plan: e.target.value })}>
              <option value="">All plans</option>
              {plans.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
              {params.plan && !plans.includes(params.plan) && <option value={params.plan}>{params.plan}</option>}
            </Select>
          </Field>
        </div>
        <Button variant="secondary" onClick={() => setReload((r) => r + 1)}>
          Refresh
        </Button>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3 text-right">Monthly</th>
              <th className="px-4 py-3">Renewal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Failed payments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/subscriptions/${s.id}`)}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link href={`/subscriptions/${s.id}`} className="hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                    {s.customer_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{s.plan}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatMoney(s.monthly_amount)}</td>
                <td className="px-4 py-3 text-slate-700">{s.renewal_date}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.failed_payment_count}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No subscriptions found.
                </td>
              </tr>
            )}
            {!data && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {loading ? "Loading…" : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} subscription{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={params.page <= 1} onClick={() => update({ page: params.page - 1 })}>
              Previous
            </Button>
            <Button variant="secondary" disabled={params.page >= totalPages} onClick={() => update({ page: params.page + 1 })}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateSubscription({ onCreated }: { onCreated: (s: Subscription) => void }) {
  const [form, setForm] = useState({
    customer_name: "",
    plan: "",
    monthly_amount: "",
    renewal_date: "",
    status: "active" as Status,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        customer_name: form.customer_name,
        plan: form.plan,
        monthly_amount: Number(form.monthly_amount),
        status: form.status,
      };
      if (form.renewal_date) body.renewal_date = form.renewal_date;
      const s = await api<Subscription>("/subscriptions", { method: "POST", body });
      onCreated(s);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="New subscription">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {error && (
          <div className="sm:col-span-2 lg:col-span-5">
            <Alert>{error}</Alert>
          </div>
        )}
        <Field label="Customer name">
          <Input required maxLength={200} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
        </Field>
        <Field label="Plan">
          <Input required maxLength={100} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
        </Field>
        <Field label="Monthly amount">
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            value={form.monthly_amount}
            onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })}
          />
        </Field>
        <Field label="Renewal date">
          <Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2 lg:col-span-5">
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create subscription"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
