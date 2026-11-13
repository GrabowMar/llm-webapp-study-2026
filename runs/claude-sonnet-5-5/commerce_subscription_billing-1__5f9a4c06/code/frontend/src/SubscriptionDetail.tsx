import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, money, STATUSES, statusLabel } from "./api";
import type { Invoice, Status, Subscription } from "./api";
import { Badge, btnCls, btnSecondaryCls, Card, ErrorMsg, Field, inputCls } from "./ui";

export default function SubscriptionDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState("");
  const [renewal, setRenewal] = useState("");
  const [status, setStatus] = useState<Status>("trial");

  const [invAmount, setInvAmount] = useState("");
  const [invDue, setInvDue] = useState("");

  const fill = (s: Subscription) => {
    setSub(s);
    setName(s.customer_name);
    setPlan(s.plan);
    setAmount(String(s.monthly_amount));
    setRenewal(s.renewal_date);
    setStatus(s.status);
  };

  const loadInvoices = useCallback(async () => {
    const res = await api<{ items: Invoice[] }>("GET", `/subscriptions/${id}/invoices`);
    setInvoices(res.items);
  }, [id]);

  useEffect(() => {
    api<Subscription>("GET", `/subscriptions/${id}`)
      .then(fill)
      .catch((e: Error) => setError(e.message));
    loadInvoices().catch((e: Error) => setError(e.message));
  }, [id, loadInvoices]);

  async function run(action: () => Promise<void>, message?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (message) setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      fill(
        await api<Subscription>("PATCH", `/subscriptions/${id}`, {
          customer_name: name,
          plan,
          monthly_amount: Number(amount),
          renewal_date: renewal,
          status,
        }),
      );
    }, "Saved");
  };

  const issue = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const body: Record<string, unknown> = {};
      if (invAmount) body.amount_due = Number(invAmount);
      if (invDue) body.due_date = invDue;
      await api("POST", `/subscriptions/${id}/invoices`, body);
      setInvAmount("");
      setInvDue("");
      await loadInvoices();
    }, "Invoice issued");
  };

  const collect = (outcome: "failed" | "succeeded") =>
    run(async () => {
      fill(await api<Subscription>("POST", `/subscriptions/${id}/collections`, { outcome }));
      await loadInvoices();
    }, `Recorded ${outcome} collection run`);

  return (
    <div className="space-y-4">
      <button className="text-sm text-indigo-600 hover:underline" onClick={onBack}>
        &larr; All subscriptions
      </button>
      <ErrorMsg message={error} />
      {notice && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {sub && (
        <>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{sub.customer_name}</h1>
            <Badge status={sub.status} />
            <span className="text-sm text-slate-500">Failed payments: {sub.failed_payment_count}</span>
          </div>
          <Card title="Details">
            <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
              <Field label="Customer">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
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
                <select
                  className={inputCls}
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <button className={btnCls} type="submit">
                  Save changes
                </button>
              </div>
            </form>
          </Card>
          <Card title="Collections">
            <div className="flex gap-2">
              <button className={btnSecondaryCls} onClick={() => collect("failed")}>
                Record failed collection
              </button>
              <button className={btnCls} onClick={() => collect("succeeded")}>
                Record successful collection
              </button>
            </div>
          </Card>
          <Card title="Issue invoice">
            <form onSubmit={issue} className="grid gap-3 md:grid-cols-3">
              <Field label={`Amount due (default ${money(sub.monthly_amount)})`}>
                <input
                  className={inputCls}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value)}
                />
              </Field>
              <Field label="Due date (default today)">
                <input
                  className={inputCls}
                  type="date"
                  value={invDue}
                  onChange={(e) => setInvDue(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <button className={btnCls} type="submit">
                  Issue invoice
                </button>
              </div>
            </form>
          </Card>
          <Card title="Invoice history">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Paid at</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{i.id}</td>
                    <td className="py-2 pr-4">{money(i.amount_due)}</td>
                    <td className="py-2 pr-4">{i.due_date}</td>
                    <td className="py-2 pr-4 capitalize">{i.status}</td>
                    <td className="py-2 pr-4">{i.paid_at ?? "-"}</td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      No invoices yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
