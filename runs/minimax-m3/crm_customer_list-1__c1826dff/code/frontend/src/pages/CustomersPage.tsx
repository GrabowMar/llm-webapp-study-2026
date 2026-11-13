import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, type CustomerList } from "../api";
import AppShell from "../components/AppShell";
import { Alert, Spinner } from "../components/ui";
import { formatDate } from "../format";

const PAGE_SIZES = [10, 20, 50, 100];

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<CustomerList>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCompanies()
      .then((data) => setCompanies(data.items))
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listCustomers({ q: query, company, page, page_size: pageSize })
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("The customer list could not be loaded. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, company, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
  const firstShown = result.total === 0 ? 0 : (result.page - 1) * result.page_size + 1;
  const lastShown = Math.min(result.page * result.page_size, result.total);
  const canPrev = result.page > 1;
  const canNext = result.page < totalPages;

  const rows = useMemo(() => result.items, [result.items]);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
            <p className="mt-1 text-sm text-slate-500">
              Everyone on the team shares this list and can edit any record.
            </p>
          </div>
          <Link
            to="/customers/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Add customer
          </Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
            <div className="relative min-w-[16rem] flex-1">
              <label htmlFor="search" className="sr-only">
                Search customers
              </label>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              >
                <path
                  d="M9 3.5a5.5 5.5 0 1 1-3.9 9.4 5.5 5.5 0 0 1 3.9-9.4Zm2.6 10.1L17 19"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              <input
                id="search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, company or phone"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <div className="min-w-[12rem]">
              <label htmlFor="company" className="sr-only">
                Filter by company
              </label>
              <select
                id="company"
                value={company}
                onChange={(event) => {
                  setCompany(event.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">All companies</option>
                {companies.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div className="p-4">
              <Alert tone="error">{error}</Alert>
            </div>
          ) : null}

          {loading && rows.length === 0 ? (
            <Spinner label="Loading customers" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Email
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Phone
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Company
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Last contacted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((customer) => (
                    <tr key={customer.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          to={`/customers/${customer.id}`}
                          className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
                        >
                          {customer.name}
                        </Link>
                        {customer.interaction_count > 0 ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {customer.interaction_count}{" "}
                            {customer.interaction_count === 1 ? "log" : "logs"}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{customer.email || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{customer.phone || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{customer.company || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(customer.last_contacted_at)}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                        <p className="font-medium text-slate-700">No customers found</p>
                        <p className="mt-1 text-sm">
                          {query || company
                            ? "Try a different search or clear the company filter."
                            : "Add the first customer to get started."}
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            <p>
              {result.total === 0
                ? "No customers"
                : `Showing ${firstShown}–${lastShown} of ${result.total}`}
            </p>
            <div className="flex items-center gap-3">
              <label htmlFor="page-size" className="text-sm text-slate-500">
                Per page
              </label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span className="text-slate-500">
                Page {result.page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!canPrev || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={!canNext || loading}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
