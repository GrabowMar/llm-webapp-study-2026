import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  formatMoney,
  STATUS_OPTIONS,
  type Invoice,
  type Subscription,
} from "../api";
import { StatusBadge } from "../Layout";

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const subId = Number(id);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [form, setForm] = useState({
    customer_name: "",
    plan: "",
    monthly_amount: "",
    renewal_date: "",
    status: "",
  });

  const load = useCallback(() => {
    api
      .getSubscription(subId)
      .then((s) => {
        setSubscription(s);
        setForm({
          customer_name: s.customer_name,
          plan: s.plan,
          monthly_amount: String(s.monthly_amount),
          renewal_date: s.renewal_date,
          status: s.status,
        });
      })
      .catch((e) => setError(e.message));
    api
      .listInvoices(subId)
      .then((d) => setInvoices(d.items))
      .catch(() => {});
  }, [subId]);

  useEffect(load, [load]);

  const set = (key: string, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    try {
      const updated = await api.patchSubscription(subId, {
        customer_name: form.customer_name,
        plan: form.plan,
        monthly_amount: Number(form.monthly_amount),
        renewal_date: form.renewal_date,
        status: form.status,
      });
      setSubscription(updated);
    } catch (err) {
      setEditError((err as Error).message);
    }
  };

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDue, setInvoiceDue] = useState("");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const issueInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvoiceError(null);
    try {
      await api.issueInvoice(subId, {
        amount_due: invoiceAmount ? Number(invoiceAmount) : undefined,
        due_date: invoiceDue || undefined,
      });
      setInvoiceAmount("");
      setInvoiceDue("");
      api.listInvoices(subId).then((d) => setInvoices(d.items));
    } catch (err) {
      setInvoiceError((err as Error).message);
    }
  };

  const recordCollection = async (outcome: "failed" | "succeeded") => {
    setEditError(null);
    try {
      const updated = await api.recordCollection(subId, outcome);
      setSubscription(updated);
      setForm((f) => ({ ...f, status: updated.status }));
      api.listInvoices(subId).then((d) => setInvoices(d.items));
    } catch (err) {
      setEditError((err as Error).message);
    }
  };

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!subscription) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          to="/subscriptions"
          className="text-sm text-indigo-600 hover:underline"
        >
          ← Subscriptions
        </Link>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">
          {subscription.customer_name}
        </h1>
        <StatusBadge status={subscription.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Edit</h2>
          <form onSubmit={save} className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Customer name
              </label>
              <input
                value={form.customer_name}
                onChange={(e) => set("customer_name", e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Plan
              </label>
              <input
                value={form.plan}
                onChange={(e) => set("plan", e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Monthly amount
              </label>
              <input
                type="number"
                step="0.01"
                value={form.monthly_amount}
                onChange={(e) => set("monthly_amount", e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Renewal date
              </label>
              <input
                type="date"
                value={form.renewal_date}
                onChange={(e) => set("renewal_date", e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Save changes
            </button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Record collection run
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Applies to this subscription's open invoices.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => recordCollection("failed")}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Record failed
              </button>
              <button
                onClick={() => recordCollection("succeeded")}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Record succeeded
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-gray-900">Issue invoice</h2>
            <form onSubmit={issueInvoice} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount due
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  placeholder={String(subscription.monthly_amount)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Due date
                </label>
                <input
                  type="date"
                  value={invoiceDue}
                  onChange={(e) => setInvoiceDue(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              {invoiceError && (
                <p className="text-sm text-red-600">{invoiceError}</p>
              )}
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Issue invoice
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-4 text-lg font-semibold text-gray-900">
          Invoice history
        </h2>
        {invoices.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">No invoices yet.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Amount due</th>
                <th className="px-6 py-3">Due date</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Paid at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-6 py-3 text-gray-500">#{inv.id}</td>
                  <td className="px-6 py-3">{formatMoney(inv.amount_due)}</td>
                  <td className="px-6 py-3">{inv.due_date}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-6 py-3 text-gray-500">{inv.paid_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
