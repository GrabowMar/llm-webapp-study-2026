import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createSubscription,
  type Subscription,
  type SubscriptionInput,
} from "../api";
import {
  buttonClass,
  Card,
  ErrorBanner,
  Field,
  inputClass,
  STATUSES,
  STATUS_LABELS,
} from "../ui";

function defaultRenewalDate(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export default function NewSubscriptionPage() {
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState("");
  const [plan, setPlan] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [renewalDate, setRenewalDate] = useState(defaultRenewalDate());
  const [status, setStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const amount = Number(monthlyAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Monthly amount must be a non-negative number");
      return;
    }
    setBusy(true);
    try {
      const input: SubscriptionInput = {
        customer_name: customerName.trim(),
        plan: plan.trim(),
        monthly_amount: amount,
        renewal_date: renewalDate,
        status,
      };
      const created: Subscription = await createSubscription(input);
      navigate(`/subscriptions/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create subscription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link
          to="/subscriptions"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Back to subscriptions
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          New subscription
        </h1>
      </div>
      <Card>
        {error ? <ErrorBanner message={error} /> : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Customer name">
            <input
              className={inputClass}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              required
            />
          </Field>
          <Field label="Plan">
            <input
              className={inputClass}
              value={plan}
              onChange={(event) => setPlan(event.target.value)}
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
                value={monthlyAmount}
                onChange={(event) => setMonthlyAmount(event.target.value)}
                required
              />
            </Field>
            <Field label="Renewal date">
              <input
                className={inputClass}
                type="date"
                value={renewalDate}
                onChange={(event) => setRenewalDate(event.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="Status">
            <select
              className={inputClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className={buttonClass("primary")}
              disabled={busy}
            >
              {busy ? "Creating…" : "Create subscription"}
            </button>
            <Link to="/subscriptions" className={buttonClass("secondary")}>
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
