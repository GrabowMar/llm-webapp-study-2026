import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiCreateInvoice, apiInvoices, apiRecordCollection, apiSubscription, apiUpdateSubscription } from "../api";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatDateTime, formatMoney } from "../format";
import { STATUS_LABELS, STATUS_ORDER } from "../types";
import type { Invoice, Subscription, SubscriptionStatus } from "../types";

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const subscriptionId = Number(id);

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus>("active");
  const [saving, setSaving] = useState(false);

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [issuing, setIssuing] = useState(false);

  const [collectionBusy, setCollectionBusy] = useState(false);

  const applySubscription = useCallback((value: Subscription) => {
    setSubscription(value);
    setCustomerName(value.customer_name);
    setPlan(value.plan);
    setAmount(String(value.monthly_amount));
    setRenewalDate(value.renewal_date);
    setStatus(value.status);
    setInvoiceAmount(String(value.monthly_amount));
    setInvoiceDueDate(value.renewal_date);
  }, []);

  const load = useCallback(() => {
    if (!Number.isFinite(subscriptionId)) return;
    setLoading(true);
    Promise.all([apiSubscription(subscriptionId), apiInvoices(subscriptionId)])
      .then(([detail, invoiceList]) => {
        applySubscription(detail);
        setInvoices(invoiceList.items);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [subscriptionId, applySubscription]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const updated = await apiUpdateSubscription(subscription.id, {
        customer_name: customerName.trim(),
        plan: plan.trim(),
        monthly_amount: Number(amount) || 0,
        renewal_date: renewalDate,
        status,
      });
      applySubscription(updated);
      setNotice("Subscription updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the subscription");
    } finally {
      setSaving(false);
    }
  }

  async function handleIssueInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription) return;
    setIssuing(true);
    setNotice(null);
    setError(null);
    try {
      await apiCreateInvoice(subscription.id, {
        amount_due: Number(invoiceAmount) || 0,
        due_date: invoiceDueDate,
      });
      const list = await apiInvoices(subscription.id);
      setInvoices(list.items);
      setNotice("Invoice issued.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue the invoice");
    } finally {
      setIssuing(false);
    }
  }

  async function handleCollection(outcome: "failed" | "succeeded") {
    if (!subscription) return;
    setCollectionBusy(true);
    setNotice(null);
    setError(null);
    try {
      const updated = await apiRecordCollection(subscription.id, outcome);
      applySubscription(updated);
      const list = await apiInvoices(subscription.id);
      setInvoices(list.items);
      setNotice(
        outcome === "succeeded"
          ? "Collection run succeeded — open invoices were paid."
          : "Collection run failed — the subscription is now past due.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the collection run");
    } finally {
      setCollectionBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading subscription…</p>;
  }

  if (!subscription) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ?? "Subscription not found."}
        </p>
        <Link to="/subscriptions" className="text-sm font-medium text-indigo-600">
          Back to subscriptions
        </Link>
      </div>
    );
  }

  const inputClass =
    "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/subscriptions" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            ← All subscriptions
          </Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {subscription.customer_name}
            <StatusBadge status={subscription.status} />
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            #{subscription.id} · {subscription.plan} · {formatMoney(subscription.monthly_amount)} per month
            · created {formatDate(subscription.created_at)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Failed payments</p>
          <p className="text-2xl font-semibold tabular-nums">
            {subscription.failed_payment_count}
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold tracking-tight">Edit subscription</h2>
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <div>
              <label htmlFor="customer_name" className="block text-sm font-medium text-slate-700">
                Customer name
              </label>
              <input
                id="customer_name"
                required
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="plan" className="block text-sm font-medium text-slate-700">
                  Plan
                </label>
                <input
                  id="plan"
                  required
                  value={plan}
                  onChange={(event) => setPlan(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="monthly_amount" className="block text-sm font-medium text-slate-700">
                  Monthly amount
                </label>
                <input
                  id="monthly_amount"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="renewal_date" className="block text-sm font-medium text-slate-700">
                  Renewal date
                </label>
                <input
                  id="renewal_date"
                  required
                  type="date"
                  value={renewalDate}
                  onChange={(event) => setRenewalDate(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as SubscriptionStatus)}
                  className={`${inputClass} bg-white`}
                >
                  {STATUS_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight">Payment collection</h2>
            <p className="mt-1 text-sm text-slate-500">
              Record the outcome of one collection run over the open invoices of this subscription.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={collectionBusy}
                onClick={() => {
                  void handleCollection("failed");
                }}
                className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                Record failed run
              </button>
              <button
                type="button"
                disabled={collectionBusy}
                onClick={() => {
                  void handleCollection("succeeded");
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                Record successful run
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold tracking-tight">Issue invoice</h2>
            <form onSubmit={handleIssueInvoice} className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="amount_due" className="block text-sm font-medium text-slate-700">
                    Amount due
                  </label>
                  <input
                    id="amount_due"
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceAmount}
                    onChange={(event) => setInvoiceAmount(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="due_date" className="block text-sm font-medium text-slate-700">
                    Due date
                  </label>
                  <input
                    id="due_date"
                    type="date"
                    value={invoiceDueDate}
                    onChange={(event) => setInvoiceDueDate(event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={issuing}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {issuing ? "Issuing…" : "Issue invoice"}
              </button>
            </form>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold tracking-tight">Invoice history</h2>
          <span className="text-sm text-slate-500">{invoices.length} invoice{invoices.length === 1 ? "" : "s"}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Amount due</th>
                <th scope="col" className="px-5 py-3 font-medium">Due date</th>
                <th scope="col" className="px-5 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 font-medium">Paid at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">
                    #{invoice.id}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                    {formatMoney(invoice.amount_due)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {formatDate(invoice.due_date)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                    {invoice.paid_at ? formatDateTime(invoice.paid_at) : "—"}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    No invoices yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
