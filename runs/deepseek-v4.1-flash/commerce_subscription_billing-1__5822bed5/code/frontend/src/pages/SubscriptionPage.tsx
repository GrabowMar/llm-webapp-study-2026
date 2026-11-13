import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Invoice, Status, Subscription } from "../types";

const STATUS_OPTIONS: { value: Status; label: string }[] = [
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

export function SubscriptionPage({
  id,
  navigate,
}: {
  id: number;
  navigate: (p: string) => void;
}) {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, inv] = await Promise.all([
        api<Subscription>(`/subscriptions/${id}`),
        api<{ items: Invoice[] }>(`/subscriptions/${id}/invoices`),
      ]);
      setSub(s);
      setInvoices(inv.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  };

  const recordCollection = async (outcome: "failed" | "succeeded") => {
    setError(null);
    try {
      await api(`/subscriptions/${id}/collections`, {
        method: "POST",
        body: { outcome },
      });
      flash(
        outcome === "succeeded"
          ? "Collection succeeded; open invoices marked paid."
          : "Failed collection recorded.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record collection");
    }
  };

  if (loading && !sub) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }
  if (!sub) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? "Subscription not found."}
        </div>
        <button
          onClick={() => navigate("/subscriptions")}
          className="text-sm font-medium text-slate-700 hover:underline"
        >
          ← Back to subscriptions
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/subscriptions")}
        className="text-sm font-medium text-slate-600 hover:underline"
      >
        ← Back to subscriptions
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{sub.customer_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {sub.plan} · ${sub.monthly_amount.toFixed(2)} / month · renews{" "}
            {sub.renewal_date}
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[sub.status]}`}
        >
          {STATUS_LABELS[sub.status]}
        </span>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <EditForm sub={sub} onSaved={(s) => { setSub(s); flash("Subscription updated."); }} onError={setError} />

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Collection runs
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record the outcome of a collection attempt over all open invoices.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => recordCollection("succeeded")}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Record successful collection
              </button>
              <button
                onClick={() => recordCollection("failed")}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Record failed collection
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Failed payments</dt>
                <dd className="font-medium">{sub.failed_payment_count}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Open invoices</dt>
                <dd className="font-medium">
                  {invoices.filter((i) => i.status === "open").length}
                </dd>
              </div>
            </dl>
          </div>

          <IssueInvoice sub={sub} onIssued={load} onError={setError} onDone={() => flash("Invoice issued.")} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Invoice history
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Due date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">#{inv.id}</td>
                  <td className="px-4 py-3 text-slate-600">
                    ${inv.amount_due.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inv.due_date}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        inv.status === "paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {inv.paid_at ? new Date(inv.paid_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No invoices yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EditForm({
  sub,
  onSaved,
  onError,
}: {
  sub: Subscription;
  onSaved: (s: Subscription) => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    customer_name: sub.customer_name,
    plan: sub.plan,
    monthly_amount: String(sub.monthly_amount),
    renewal_date: sub.renewal_date,
    status: sub.status,
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api<Subscription>(`/subscriptions/${sub.id}`, {
        method: "PATCH",
        body: {
          ...form,
          monthly_amount: Number(form.monthly_amount),
        },
      });
      onSaved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Edit subscription
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
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
            onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
            className={field}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function IssueInvoice({
  sub,
  onIssued,
  onError,
  onDone,
}: {
  sub: Subscription;
  onIssued: () => Promise<void>;
  onError: (msg: string) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(sub.monthly_amount));
  const [dueDate, setDueDate] = useState(sub.renewal_date);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/subscriptions/${sub.id}/invoices`, {
        method: "POST",
        body: { amount_due: Number(amount), due_date: dueDate },
      });
      onDone();
      await onIssued();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to issue invoice");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Issue invoice
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Amount due</span>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={field}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Due date</span>
          <input
            required
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {busy ? "Issuing…" : "Issue open invoice"}
      </button>
    </form>
  );
}
