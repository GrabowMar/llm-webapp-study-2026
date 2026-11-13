import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { formatDate } from "../format";
import { Alert, buttonSecondary, inputClass } from "../ui";
import { Link, useNavigate } from "../router";
import type { CustomerPage } from "../types";

const PAGE_SIZE = 10;

export default function DirectoryPage({ onSignedOut }: { onSignedOut: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomerPage | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debounced, company]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    if (debounced) params.set("q", debounced);
    if (company) params.set("company", company);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));

    api<CustomerPage>(`/customers?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onSignedOut();
          return;
        }
        setError(err instanceof Error ? err.message : "Could not load customers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, company, page, onSignedOut]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: string[] }>("/companies")
      .then((result) => {
        if (!cancelled) setCompanies(result.items);
      })
      .catch(() => {
        /* Non-critical: ignore filter options failure. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = useMemo(() => {
    if (!data || data.total === 0) return 1;
    return Math.max(1, Math.ceil(data.total / data.page_size));
  }, [data]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Directory</h1>
          <p className="mt-1 text-sm text-slate-600">
            {data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            ⌕
          </span>
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search name, email, company, phone or notes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search customers"
          />
        </div>
        <select
          className={`${inputClass} sm:w-64`}
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          aria-label="Filter by company"
        >
          <option value="">All companies</option>
          {companies.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Last contacted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Loading customers…
                  </td>
                </tr>
              ) : data && data.items.length > 0 ? (
                data.items.map((customer) => (
                  <tr
                    key={customer.id}
                    className="cursor-pointer transition hover:bg-sky-50/60"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{customer.email ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{customer.company ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(customer.last_contacted_at)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {debounced || company
                      ? "No customers match your filters."
                      : "No customers yet. Add your first one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row">
          <span className="text-sm text-slate-600">
            Page {data?.page ?? page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonSecondary}
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={buttonSecondary}
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
