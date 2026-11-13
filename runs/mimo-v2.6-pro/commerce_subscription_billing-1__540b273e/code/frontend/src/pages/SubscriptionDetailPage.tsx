import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getSubscription,
  issueInvoice,
  listInvoices,
  recordCollection,
  updateSubscription,
  type Invoice,
  type Subscription,
} from "../api";
import {
  buttonClass,
  Card,
  ErrorBanner,
  Field,
  formatDate,
  formatMoney,
  inputClass,
  normalizeStatus,
  Notice,
  STATUSES,
  STATUS_LABELS,
  StatusBadge,
} from "../ui";

interface EditForm {
  customer_name: string;
  plan: string;
  monthly_amount: string;
  renewal_date: string;
  status: string;
}

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const subscriptionId = Number(id);
  const validId = Number.isInteger(subscriptionId) && subscriptionId > 0;

  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");

  const load = useCallback(async () => {
    const [subscription, invoiceList] = await Promise.all([
      getSubscription(subscriptionId),
      listInvoices(subscriptionId),
    ]);
    setSub(subscription);
    setInvoices(invoiceList.items);
    setForm({
      customer_name: subscription.customer_name,
      plan: subscription.plan,
      monthly_amount: String(subscription.monthly_amount),
      renewal_date: subscription.renewal_date,
      status: normalizeStatus(subscription.status),
    });
  }, [subscriptionId]);

  useEffect(() => {
    if (!validId) {
      setLoading(false);
      setError("Subscription not found");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load subscription");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [validId, load]);

  async function runAction(action: () => Promise<void>, message: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
      setNotice(message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const amount = Number(form.monthly_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Monthly amount must be a non-negative number");
      return;
    }
    void runAction(async () => {
      await updateSubscription(subscriptionId, {
        customer_name: form.customer_name.trim(),
        plan: form.plan.trim(),
        monthly_amount: amount,
        renewal_date: form.renewal_date,
        status: form.status,
      });
      await load();
    }, "Subscription updated.");
  }

  function handleIssueInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(async () => {
      const payload: { amount_due?: number; due_date?: string } = {};
      if (invoiceAmount.trim() !== "") {
        const amount = Number(invoiceAmount);
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error("Amount due must be a non-negative number");
        }
        payload.amount_due = amount;
      }
      if (invoiceDueDate.trim() !== "") payload.due_date = invoiceDueDate;
      await issueInvoice(subscriptionId, payload);
      setInvoiceAmount("");
      setInvoiceDueDate("");
      await load();
    }, "Invoice issued.");
  }

  function handleCollection(outcome: "failed" | "succeeded") {
    void runAction(async () => {
      await recordCollection(subscriptionId, outcome);
      await load();
    }, outcome === "failed" ? "Failed collection recorded." : "Successful collection recorded.");
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (!sub || !form) {
    return (
      <div>
        {error ? <ErrorBanner message={error} /> : null}
        <Link
          to="/subscriptions"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Back to subscriptions
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/subscriptions"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            ← Back to subscriptions
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {sub.customer_name}
            </h1>
            <StatusBadge status={sub.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Subscription #{sub.id} · created {formatDate(sub.created_at)} ·{" "}
            {sub.failed_payment_count} failed payment
            {sub.failed_payment_count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}
      {notice ? <Notice message={notice} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Edit subscription">
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Customer name">
              <input
                className={inputClass}
                value={form.customer_name}
                onChange={(event) =>
                  setForm({ ...form, customer_name: event.target.value })
                }
                required
              />
            </Field>
            <Field label="Plan">
              <input
                className={inputClass}
                value={form.plan}
                onChange={(event) =>
                  setForm({ ...form, plan: event.target.value })
                }
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly amount">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthly_amount}
                  onChange={(event) =>
                    setForm({ ...form, monthly_amount: event.target.value })
                  }
                  required
                />
              </Field>
              <Field label="Renewal date">
                <input
                  className={inputClass}
                  type="date"
                  value={form.renewal_date}
                  onChange={(event) =>
                    setForm({ ...form, renewal_date: event.target.value })
                  }
                  required
                />
              </Field>
            </div>
            <Field label="Status">
              <select
                className={inputClass}
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
              >
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {STATUS_LABELS[option]}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="submit"
              className={buttonClass("primary")}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Collections">
            <p className="text-sm text-slate-500">
              Record the outcome of one collection run over this
              subscription&apos;s open invoices.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className={buttonClass("danger")}
                disabled={busy}
                onClick={() => handleCollection("failed")}
              >
                Record failed collection
              </button>
              <button
                type="button"
                className={buttonClass("primary")}
                disabled={busy}
                onClick={() => handleCollection("succeeded")}
              >
                Record successful collection
              </button>
            </div>
          </Card>

          <Card title="Issue invoice">
            <form onSubmit={handleIssueInvoice} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount due" hint="Defaults to the monthly amount.">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceAmount}
                    onChange={(event) => setInvoiceAmount(event.target.value)}
                  />
                </Field>
                <Field label="Due date" hint="Defaults to today.">
                  <input
                    className={inputClass}
                    type="date"
                    value={invoiceDueDate}
                    onChange={(event) => setInvoiceDueDate(event.target.value)}
                  />
                </Field>
              </div>
              <button
                type="submit"
                className={buttonClass("primary")}
                disabled={busy}
              >
                {busy ? "Issuing…" : "Issue invoice"}
              </button>
            </form>
          </Card>
        </div>
      </div>

      <div className="mt-6">
        <Card title="Invoice history">
          {invoices.length === 0 ? (
            <p className="text-sm text-slate-500">No invoices yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4 font-medium">Invoice</th>
                    <th className="py-2 pr-4 font-medium">Amount due</th>
                    <th className="py-2 pr-4 font-medium">Due date</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Paid at</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-3 pr-4 text-slate-700">#{invoice.id}</td>
                      <td className="py-3 pr-4 text-slate-700">
                        {formatMoney(invoice.amount_due)}
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {formatDate(invoice.due_date)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            normalizeStatus(invoice.status) === "paid"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {invoice.status === "paid" ? "Paid" : "Open"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-slate-700">
                        {invoice.paid_at ? formatDate(invoice.paid_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
