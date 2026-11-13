import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import type { Customer } from "../types";
import { navigate } from "../router";
import { useAuth } from "../auth";
import CustomerForm from "../components/CustomerForm";
import { ErrorBanner, formatDate, inputClass, Spinner } from "../ui";

const PAGE_SIZE = 10;

export default function CustomerListScreen() {
  const auth = useAuth();
  const [data, setData] = useState<{ items: Customer[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);

  const [showAdd, setShowAdd] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(qInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setCompany(companyInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [companyInput]);

  const refresh = useCallback(() => {
    setLoading(true);
    api
      .listCustomers({ q, company, page, page_size: PAGE_SIZE })
      .then((res) => {
        setData(res);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Failed to load customers."))
      .finally(() => setLoading(false));
  }, [q, company, page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)), [data]);

  async function handleAdd(input: { name: string; email: string; phone: string; company: string; notes: string }) {
    setBusy(true);
    setSaveError(null);
    try {
      await api.createCustomer(input);
      setShowAdd(false);
      if (page !== 1) setPage(1);
      else refresh();
      return true;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save customer.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">Customers</h2>
        <button
          onClick={() => {
            setShowAdd(true);
            setSaveError(null);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          + Add customer
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search name, email or company…"
          className={inputClass + " min-w-56 flex-1"}
          aria-label="Search customers"
        />
        <input
          value={companyInput}
          onChange={(e) => setCompanyInput(e.target.value)}
          placeholder="Filter by company…"
          className={inputClass + " min-w-44"}
          aria-label="Filter by company"
        />
      </div>

      {showAdd && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Add customer</h3>
          <CustomerForm
            submitLabel="Create"
            error={saveError}
            busy={busy}
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {loadError && <ErrorBanner>{loadError}</ErrorBanner>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Last contacted</th>
              <th className="px-4 py-3">Logged interactions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !data ? (
              <tr>
                <td colSpan={6}>
                  <Spinner />
                </td>
              </tr>
            ) : data && data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  {q || company ? "No customers match your filters." : "No customers yet. Add the first one."}
                </td>
              </tr>
            ) : (
              data?.items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/customers/${c.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.company ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(c.last_contacted_at)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      {c.interaction_count}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : ""}
          {auth.username ? ` — signed in as ${auth.username}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-2">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
