import { useCallback, useEffect, useState } from "react";
import type { Invoice, Status, Subscription } from "../api";
import { STATUSES, STATUS_LABELS, api, errorMessage, formatDateTime, formatMoney } from "../api";
import { Alert, Button, Card, Field, Input, InvoiceBadge, Link, Select, StatusBadge } from "../ui";

export default function SubscriptionPage({ id }: { id: number }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, inv] = await Promise.all([
        api<Subscription>(`/subscriptions/${id}`),
        api<{ items: Invoice[] }>(`/subscriptions/${id}/invoices`),
      ]);
      setSub(s);
      setInvoices(inv.items);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    setSub(null);
    load();
  }, [load]);

  async function collect(outcome: "failed" | "succeeded") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/subscriptions/${id}/collections`, { method: "POST", body: { outcome } });
      setNotice(outcome === "succeeded" ? "Successful collection recorded." : "Failed collection recorded.");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const openInvoices = invoices.filter((i) => i.status === "open");
  const openTotal = openInvoices.reduce((sum, i) => sum + Math.round(i.amount_due * 100), 0) / 100;

  return (
    <div className="space-y-5">
      <Link href="/subscriptions" className="text-sm font-medium text-indigo-600 hover:underline">
        ← Back to subscriptions
      </Link>
      {error && <Alert>{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {!sub && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {sub && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{sub.customer_name}</h1>
            <StatusBadge status={sub.status} />
          </div>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Plan" value={sub.plan} />
            <Stat label="Monthly amount" value={formatMoney(sub.monthly_amount)} />
            <Stat label="Renewal date" value={sub.renewal_date} />
            <Stat label="Failed payments" value={String(sub.failed_payment_count)} />
          </dl>

          <div className="grid gap-5 lg:grid-cols-2">
            <EditForm
              sub={sub}
              onSaved={(s) => {
                setSub(s);
                setNotice("Subscription saved.");
                setError(null);
              }}
            />
            <div className="space-y-5">
              <IssueInvoice
                sub={sub}
                onIssued={async () => {
                  setNotice("Invoice issued.");
                  setError(null);
                  await load();
                }}
              />
              <Card title="Collection run">
                <p className="mb-4 text-sm text-slate-600">
                  {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"} totalling {formatMoney(openTotal)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" disabled={busy || openInvoices.length === 0} onClick={() => collect("failed")}>
                    Record failed collection
                  </Button>
                  <Button variant="success" disabled={busy || openInvoices.length === 0} onClick={() => collect("succeeded")}>
                    Record successful collection
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          <Card title="Invoice history">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">#</th>
                    <th className="py-2 pr-4 text-right">Amount due</th>
                    <th className="py-2 pr-4">Due date</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Paid at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2 pr-4 text-slate-500">{inv.id}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(inv.amount_due)}</td>
                      <td className="py-2 pr-4">{inv.due_date}</td>
                      <td className="py-2 pr-4">
                        <InvoiceBadge status={inv.status} />
                      </td>
                      <td className="py-2 pr-4">{formatDateTime(inv.paid_at)}</td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No invoices yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function EditForm({ sub, onSaved }: { sub: Subscription; onSaved: (s: Subscription) => void }) {
  const initial = () => ({
    customer_name: sub.customer_name,
    plan: sub.plan,
    monthly_amount: String(sub.monthly_amount),
    renewal_date: sub.renewal_date,
    status: sub.status,
  });
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(initial());
  }, [sub]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const changes: Record<string, unknown> = {};
    if (form.customer_name !== sub.customer_name) changes.customer_name = form.customer_name;
    if (form.plan !== sub.plan) changes.plan = form.plan;
    if (Number(form.monthly_amount) !== sub.monthly_amount) changes.monthly_amount = Number(form.monthly_amount);
    if (form.renewal_date !== sub.renewal_date) changes.renewal_date = form.renewal_date;
    if (form.status !== sub.status) changes.status = form.status;
    if (Object.keys(changes).length === 0) {
      setError("Nothing to save.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await api<Subscription>(`/subscriptions/${sub.id}`, { method: "PATCH", body: changes });
      onSaved(s);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Edit subscription">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Customer name">
          <Input required maxLength={200} value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
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
            <Input required type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} />
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
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setForm(initial())}>
            Reset
          </Button>
        </div>
      </form>
    </Card>
  );
}

function IssueInvoice({ sub, onIssued }: { sub: Subscription; onIssued: () => Promise<void> }) {
  const [amount, setAmount] = useState(String(sub.monthly_amount));
  const [dueDate, setDueDate] = useState(sub.renewal_date);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAmount(String(sub.monthly_amount));
    setDueDate(sub.renewal_date);
  }, [sub.id, sub.monthly_amount, sub.renewal_date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/subscriptions/${sub.id}/invoices`, {
        method: "POST",
        body: { amount_due: Number(amount), due_date: dueDate },
      });
      await onIssued();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Issue invoice">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount due">
            <Input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Due date">
            <Input required type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" disabled={busy || sub.status === "cancelled"}>
          {busy ? "Issuing…" : "Issue invoice"}
        </Button>
        {sub.status === "cancelled" && <p className="text-xs text-slate-500">Cancelled subscriptions cannot be invoiced.</p>}
      </form>
    </Card>
  );
}
