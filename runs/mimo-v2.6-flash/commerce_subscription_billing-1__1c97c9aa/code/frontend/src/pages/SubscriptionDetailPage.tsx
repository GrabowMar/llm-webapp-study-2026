import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  errorMessage,
  type CollectionOutcome,
  type Invoice,
  type Status,
  type Subscription,
} from "../api";
import {
  ErrorNote,
  InvoiceBadge,
  LoadingNote,
  StatusBadge,
  SuccessNote,
  canonicalStatus,
  formatDate,
  formatMoney,
  statusLabel,
} from "../components";
import { navigate } from "../router";

const STATUS_OPTIONS: Status[] = [
  "trial",
  "active",
  "past_due",
  "cancelled",
];

interface EditForm {
  customer_name: string;
  plan: string;
  monthly_amount: string;
  renewal_date: string;
  status: Status;
}

function toForm(sub: Subscription): EditForm {
  return {
    customer_name: sub.customer_name,
    plan: sub.plan,
    monthly_amount: String(sub.monthly_amount),
    renewal_date: sub.renewal_date,
    status: canonicalStatus(sub.status),
  };
}

export default function SubscriptionDetailPage({ id }: { id: number }) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [subscription, invoiceList] = await Promise.all([
      api.getSubscription(id),
      api.listInvoices(id),
    ]);
    setSub(subscription);
    setForm(toForm(subscription));
    setInvoices(invoiceList.items);
    setInvoiceAmount(String(subscription.monthly_amount));
    setInvoiceDueDate(subscription.renewal_date);
    return subscription;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function refresh() {
    const subscription = await load();
    return subscription;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError("");
    setSaveNote("");
    setBusy(true);
    try {
      const amount = Number(form.monthly_amount);
      if (!Number.isFinite(amount)) {
        throw new Error("Monthly amount must be a number");
      }
      const updated = await api.patchSubscription(id, {
        customer_name: form.customer_name,
        plan: form.plan,
        monthly_amount: amount,
        renewal_date: form.renewal_date,
        status: form.status,
      });
      setSub(updated);
      setForm(toForm(updated));
      setSaveNote("Subscription updated.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function issueInvoice(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInvoiceNote("");
    setBusy(true);
    try {
      const amount = Number(invoiceAmount);
      if (!Number.isFinite(amount)) {
        throw new Error("Amount due must be a number");
      }
      await api.issueInvoice(id, {
        amount_due: amount,
        due_date: invoiceDueDate,
      });
      const list = await api.listInvoices(id);
      setInvoices(list.items);
      setInvoiceNote("Invoice issued.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function recordCollection(outcome: CollectionOutcome) {
    setError("");
    setCollectNote("");
    setBusy(true);
    try {
      const result = await api.recordCollection(id, outcome);
      await refresh();
      const label = outcome === "failed" ? "failed" : "successful";
      setCollectNote(
        `Recorded a ${label} collection run (${result.invoices_affected} open invoice${
          result.invoices_affected === 1 ? "" : "s"
        } affected).`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !sub) {
    return (
      <div className="mx-auto max-w-4xl">
        <LoadingNote label="Loading subscription…" />
      </div>
    );
  }

  if (!sub || !form) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <ErrorNote message={error || "Subscription not found."} />
        <button
          type="button"
          onClick={() => navigate("/subscriptions")}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to subscriptions
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => navigate("/subscriptions")}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            ← Subscriptions
          </button>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {sub.customer_name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <StatusBadge status={sub.status} />
            <span>
              Plan <span className="font-medium text-slate-700">{sub.plan}</span>
            </span>
            <span>
              Failed payments{" "}
              <span className="font-medium tabular-nums text-slate-700">
                {sub.failed_payment_count}
              </span>
            </span>
            <span>Created {formatDate(sub.created_at)}</span>
          </div>
        </div>
      </div>

      <ErrorNote message={error} />

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Edit subscription
          </h2>
        </div>
        <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="customer_name"
              className="block text-sm font-medium text-slate-700"
            >
              Customer name
            </label>
            <input
              id="customer_name"
              type="text"
              required
              value={form.customer_name}
              onChange={(event) =>
                setForm({ ...form, customer_name: event.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label
              htmlFor="plan"
              className="block text-sm font-medium text-slate-700"
            >
              Plan
            </label>
            <input
              id="plan"
              type="text"
              required
              value={form.plan}
              onChange={(event) =>
                setForm({ ...form, plan: event.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label
              htmlFor="monthly_amount"
              className="block text-sm font-medium text-slate-700"
            >
              Monthly amount
            </label>
            <input
              id="monthly_amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={form.monthly_amount}
              onChange={(event) =>
                setForm({ ...form, monthly_amount: event.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label
              htmlFor="renewal_date"
              className="block text-sm font-medium text-slate-700"
            >
              Renewal date
            </label>
            <input
              id="renewal_date"
              type="date"
              required
              value={formatDate(form.renewal_date)}
              onChange={(event) =>
                setForm({ ...form, renewal_date: event.target.value })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label
              htmlFor="status"
              className="block text-sm font-medium text-slate-700"
            >
              Status
            </label>
            <select
              id="status"
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as Status })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save changes
            </button>
            <SuccessNote message={saveNote} />
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Collection run
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => recordCollection("failed")}
              className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Record failed run
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => recordCollection("succeeded")}
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Record successful run
            </button>
          </div>
        </div>
        <div className="px-5 py-4 text-sm text-slate-600">
          A run collects over this subscription's open invoices: a successful run
          marks them paid, a failed run increments the failed payment count.
          <div className="mt-3">
            <SuccessNote message={collectNote} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Invoices
          </h2>
        </div>

        <form
          onSubmit={issueInvoice}
          className="flex flex-wrap items-end gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4"
        >
          <div>
            <label
              htmlFor="invoice_amount"
              className="block text-sm font-medium text-slate-700"
            >
              Amount due
            </label>
            <input
              id="invoice_amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={invoiceAmount}
              onChange={(event) => setInvoiceAmount(event.target.value)}
              className="mt-1 w-36 rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label
              htmlFor="invoice_due_date"
              className="block text-sm font-medium text-slate-700"
            >
              Due date
            </label>
            <input
              id="invoice_due_date"
              type="date"
              required
              value={formatDate(invoiceDueDate)}
              onChange={(event) => setInvoiceDueDate(event.target.value)}
              className="mt-1 w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Issue invoice
          </button>
          <SuccessNote message={invoiceNote} />
        </form>

        {invoices.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No invoices yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-5 py-3 text-right">Amount due</th>
                  <th className="px-5 py-3">Due date</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="bg-white">
                    <td className="px-5 py-3 tabular-nums text-slate-500">
                      #{invoice.id}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900">
                      {formatMoney(invoice.amount_due)}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-5 py-3">
                      <InvoiceBadge status={invoice.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {invoice.paid_at ? formatDate(invoice.paid_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
