import { useCallback, useEffect, useState } from "react";
import { ApiError, subscriptionsApi } from "./api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Spinner,
  inputClass,
} from "./components";
import {
  STATUSES,
  formatDate,
  formatMoney,
  statusLabel,
} from "./types";
import type { Invoice, Subscription, SubscriptionInput } from "./types";

export default function DetailView({
  id,
  onBack,
}: {
  id: number;
  onBack: () => void;
}) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [edit, setEdit] = useState({
    customer_name: "",
    plan: "",
    monthly_amount: "",
    renewal_date: "",
    status: "active",
    failed_payment_count: "",
  });
  const [editError, setEditError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [issuing, setIssuing] = useState(false);

  const [collectionError, setCollectionError] = useState("");
  const [collectionNotice, setCollectionNotice] = useState("");
  const [collecting, setCollecting] = useState<string | null>(null);

  function fillEdit(sub: Subscription) {
    setEdit({
      customer_name: sub.customer_name,
      plan: sub.plan,
      monthly_amount: String(sub.monthly_amount),
      renewal_date: sub.renewal_date,
      status: STATUSES.includes(sub.status as never) ? sub.status : "active",
      failed_payment_count: String(sub.failed_payment_count),
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sub, inv] = await Promise.all([
        subscriptionsApi.get(id),
        subscriptionsApi.invoices(id),
      ]);
      setSubscription(sub);
      fillEdit(sub);
      setInvoices(inv.items);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load subscription");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    setEditError("");
    setEditNotice("");
    setSavingEdit(true);
    const input: SubscriptionInput = {
      customer_name: edit.customer_name.trim(),
      plan: edit.plan.trim(),
      monthly_amount: Number(edit.monthly_amount),
      status: edit.status,
      failed_payment_count: Number(edit.failed_payment_count),
    };
    if (edit.renewal_date) input.renewal_date = edit.renewal_date;
    try {
      const updated = await subscriptionsApi.update(id, input);
      setSubscription(updated);
      fillEdit(updated);
      setEditNotice("Subscription updated.");
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  async function issueInvoice(event: React.FormEvent) {
    event.preventDefault();
    setInvoiceError("");
    setIssuing(true);
    const input: { amount_due?: number; due_date?: string } = {};
    if (invoiceAmount !== "") input.amount_due = Number(invoiceAmount);
    if (invoiceDueDate) input.due_date = invoiceDueDate;
    try {
      await subscriptionsApi.issueInvoice(id, input);
      setInvoiceAmount("");
      setInvoiceDueDate("");
      const inv = await subscriptionsApi.invoices(id);
      setInvoices(inv.items);
    } catch (err) {
      setInvoiceError(err instanceof ApiError ? err.message : "Could not issue invoice");
    } finally {
      setIssuing(false);
    }
  }

  async function recordCollection(outcome: "failed" | "succeeded") {
    setCollectionError("");
    setCollectionNotice("");
    setCollecting(outcome);
    try {
      const updated = await subscriptionsApi.collection(id, outcome);
      setSubscription(updated);
      fillEdit(updated);
      const inv = await subscriptionsApi.invoices(id);
      setInvoices(inv.items);
      setCollectionNotice(
        outcome === "succeeded"
          ? "Collection succeeded — open invoices were paid."
          : "Collection failed — recorded a failed payment.",
      );
    } catch (err) {
      setCollectionError(
        err instanceof ApiError ? err.message : "Could not record collection run",
      );
    } finally {
      setCollecting(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onBack}>← Back</Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {subscription?.customer_name || `Subscription #${id}`}
            </h1>
            {subscription && (
              <div className="mt-1 flex items-center gap-2">
                <Badge status={subscription.status} />
                <span className="text-xs text-slate-500">#{subscription.id}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}
      {loading && !subscription && <Spinner />}

      {subscription && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly amount</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {formatMoney(subscription.monthly_amount)}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Failed payment count</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {subscription.failed_payment_count}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open invoices</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {invoices.filter((invoice) => invoice.status === "open").length}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Edit subscription</h2>
              <form onSubmit={saveEdit} className="grid gap-4 sm:grid-cols-2">
                {editError && <div className="sm:col-span-2"><Alert>{editError}</Alert></div>}
                {editNotice && <div className="sm:col-span-2"><Alert tone="success">{editNotice}</Alert></div>}
                <Field label="Customer name">
                  <input
                    className={inputClass}
                    value={edit.customer_name}
                    onChange={(event) => setEdit({ ...edit, customer_name: event.target.value })}
                  />
                </Field>
                <Field label="Plan">
                  <input
                    className={inputClass}
                    value={edit.plan}
                    onChange={(event) => setEdit({ ...edit, plan: event.target.value })}
                  />
                </Field>
                <Field label="Monthly amount">
                  <input
                    className={inputClass}
                    type="number"
                    step="0.01"
                    min="0"
                    value={edit.monthly_amount}
                    onChange={(event) => setEdit({ ...edit, monthly_amount: event.target.value })}
                  />
                </Field>
                <Field label="Renewal date">
                  <input
                    className={inputClass}
                    type="date"
                    value={edit.renewal_date}
                    onChange={(event) => setEdit({ ...edit, renewal_date: event.target.value })}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={inputClass}
                    value={edit.status}
                    onChange={(event) => setEdit({ ...edit, status: event.target.value })}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Failed payment count">
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="1"
                    value={edit.failed_payment_count}
                    onChange={(event) =>
                      setEdit({ ...edit, failed_payment_count: event.target.value })
                    }
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={savingEdit}>
                    {savingEdit ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            </Card>

            <div className="space-y-6">
              <Card>
                <h2 className="mb-1 text-sm font-semibold text-slate-800">Collection run</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Records one run over the subscription&apos;s open invoices.
                </p>
                {collectionError && <div className="mb-3"><Alert>{collectionError}</Alert></div>}
                {collectionNotice && (
                  <div className="mb-3"><Alert tone="success">{collectionNotice}</Alert></div>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="danger"
                    disabled={collecting !== null}
                    onClick={() => recordCollection("failed")}
                  >
                    {collecting === "failed" ? "Recording…" : "Record failed run"}
                  </Button>
                  <Button
                    variant="success"
                    disabled={collecting !== null}
                    onClick={() => recordCollection("succeeded")}
                  >
                    {collecting === "succeeded" ? "Recording…" : "Record successful run"}
                  </Button>
                </div>
              </Card>

              <Card>
                <h2 className="mb-1 text-sm font-semibold text-slate-800">Issue invoice</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Leave blank to use the monthly amount and renewal date.
                </p>
                <form onSubmit={issueInvoice} className="space-y-4">
                  {invoiceError && <Alert>{invoiceError}</Alert>}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={`Amount due (default ${formatMoney(subscription.monthly_amount)})`}>
                      <input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        min="0"
                        value={invoiceAmount}
                        onChange={(event) => setInvoiceAmount(event.target.value)}
                        placeholder={subscription.monthly_amount.toFixed(2)}
                      />
                    </Field>
                    <Field label={`Due date (default ${formatDate(subscription.renewal_date)})`}>
                      <input
                        className={inputClass}
                        type="date"
                        value={invoiceDueDate}
                        onChange={(event) => setInvoiceDueDate(event.target.value)}
                      />
                    </Field>
                  </div>
                  <Button type="submit" disabled={issuing}>
                    {issuing ? "Issuing…" : "Issue invoice"}
                  </Button>
                </form>
              </Card>
            </div>
          </div>

          <Card className="p-0">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-800">Invoice history</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    <tr key={invoice.id}>
                      <td className="px-5 py-3 font-medium text-slate-800">#{invoice.id}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {formatMoney(invoice.amount_due)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(invoice.due_date)}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                            invoice.status === "open"
                              ? "bg-amber-100 text-amber-800 ring-amber-200"
                              : "bg-emerald-100 text-emerald-800 ring-emerald-200"
                          }`}
                        >
                          {statusLabel(invoice.status)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(invoice.paid_at)}</td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
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
