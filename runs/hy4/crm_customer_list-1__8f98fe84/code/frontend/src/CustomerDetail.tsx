import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import {
  Button,
  ErrorBanner,
  Field,
  Spinner,
  TextArea,
  TextInput,
} from "./components";
import CustomerForm from "./CustomerForm";
import type {
  Customer,
  FieldErrors,
  Interaction,
  InteractionListResponse,
} from "./types";
import { errorParts, formatDate, formatDateTime } from "./utils";

const kindStyles: Record<string, string> = {
  call: "bg-sky-100 text-sky-700",
  email: "bg-amber-100 text-amber-700",
  meeting: "bg-violet-100 text-violet-700",
};

function KindBadge({ kind }: { kind: string }) {
  const style = kindStyles[kind] || "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}
    >
      {kind}
    </span>
  );
}

export default function CustomerDetail({
  id,
  onBack,
  onDeleted,
}: {
  id: number;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [logErrors, setLogErrors] = useState<FieldErrors>({});
  const [logMessage, setLogMessage] = useState("");
  const [logBusy, setLogBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [c, i] = await Promise.all([
        api.getCustomer(id),
        api.listInteractions(id),
      ]);
      setCustomer(c);
      setInteractions((i as InteractionListResponse).items);
    } catch (err) {
      setMessage(errorParts(err).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      await api.deleteCustomer(id);
      onDeleted();
    } catch (err) {
      setMessage(errorParts(err).message);
      setBusy(false);
    }
  }

  async function logInteraction(e: React.FormEvent) {
    e.preventDefault();
    setLogBusy(true);
    setLogMessage("");
    setLogErrors({});
    try {
      await api.createInteraction(id, {
        kind,
        summary,
        occurred_at: occurredAt || undefined,
      });
      setSummary("");
      setOccurredAt("");
      setKind("call");
      await load();
    } catch (err) {
      const parts = errorParts(err);
      setLogMessage(parts.message);
      setLogErrors(parts.errors);
    } finally {
      setLogBusy(false);
    }
  }

  if (loading && !customer) {
    return (
      <div>
        <ErrorBanner message={message} />
        <Spinner />
      </div>
    );
  }

  if (!customer) {
    return (
      <div>
        <ErrorBanner message={message} />
        <Button variant="secondary" onClick={onBack}>
          ← Back to customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm font-medium text-indigo-600 hover:underline"
      >
        ← Back to customers
      </button>

      <ErrorBanner message={message} />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {customer.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{customer.company || "—"}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
              {editing ? "Close editor" : "Edit"}
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirmDelete((v) => !v)}
            >
              Delete
            </Button>
          </div>
        </div>

        {confirmDelete && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <span className="text-sm text-red-700">
              Delete {customer.name} and all their interactions? This cannot be
              undone.
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button variant="danger" disabled={busy} onClick={remove}>
                {busy ? "Deleting…" : "Yes, delete"}
              </Button>
            </div>
          </div>
        )}

        {editing ? (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <CustomerForm
              customer={customer}
              onSaved={() => {
                setEditing(false);
                load();
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Email
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {customer.email}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Phone
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {customer.phone || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Last contacted
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {formatDate(customer.last_contacted_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Added
              </dt>
              <dd className="mt-1 text-sm text-slate-800">
                {formatDate(customer.created_at)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {customer.notes || "—"}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Interactions
          <span className="ml-2 text-sm font-normal text-slate-400">
            ({customer.interaction_count})
          </span>
        </h2>

        {interactions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No interactions logged yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {interactions.map((i) => (
              <li key={i.id} className="flex flex-wrap gap-3 py-4">
                <div className="pt-0.5">
                  <KindBadge kind={i.kind} />
                </div>
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {i.summary || "No summary"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDateTime(i.occurred_at)} · logged by{" "}
                    <span className="font-medium text-slate-700">
                      {i.logged_by}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={logInteraction}
          className="mt-6 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2"
        >
          <h3 className="sm:col-span-2 text-sm font-semibold text-slate-700">
            Log a new interaction
          </h3>
          <div className="sm:col-span-2">
            <ErrorBanner message={logMessage} />
          </div>
          <Field label="Kind" name="kind" errors={logErrors}>
            <select
              id="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
          </Field>
          <Field label="Date & time" name="occurred_at" errors={logErrors}>
            <TextInput
              id="occurred_at"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              invalid={!!logErrors.occurred_at}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Summary" name="summary" errors={logErrors}>
              <TextArea
                id="summary"
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                invalid={!!logErrors.summary}
                placeholder="What happened?"
              />
            </Field>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={logBusy}>
              {logBusy ? "Logging…" : "Log interaction"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
