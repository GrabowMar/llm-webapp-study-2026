import { useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { navigate } from "../App";
import { formatDate } from "../format";
import type { CustomerPage, CustomerPayload } from "../types";
import CustomerForm from "./CustomerForm";

const PAGE_SIZE = 10;

export default function CustomerList() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<CustomerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: string[] }>("/api/companies")
      .then((result) => {
        if (!cancelled) setCompanies(result.items);
      })
      .catch(() => {
        /* company list is a convenience; ignore failures */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (company) params.set("company", company);
    params.set("page", String(page));
    params.set("page_size", String(PAGE_SIZE));
    api<CustomerPage>(`/api/customers?${params.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
        if (result.items.length === 0 && result.page > 1) {
          setPage(Math.max(1, result.page - 1));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, company, page, refreshKey]);

  async function refreshCompanies() {
    try {
      const result = await api<{ items: string[] }>("/api/companies");
      setCompanies(result.items);
    } catch {
      /* company list is a convenience; ignore failures */
    }
  }

  async function createCustomer(payload: CustomerPayload) {
    await api("/api/customers", { method: "POST", body: payload });
    setShowForm(false);
    setQuery("");
    setSearch("");
    setCompany("");
    setPage(1);
    setRefreshKey((key) => key + 1);
    await refreshCompanies();
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const currentPage = data?.page ?? page;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(total, currentPage * pageSize);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total === 1 ? "1 customer" : `${total} customers`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Add customer
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="min-w-56 flex-1">
          <label htmlFor="customer-search" className="sr-only">
            Search customers
          </label>
          <input
            id="customer-search"
            type="search"
            placeholder="Search customers…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label htmlFor="customer-company" className="sr-only">
            Filter by company
          </label>
          <select
            id="customer-company"
            value={company}
            onChange={(event) => {
              setCompany(event.target.value);
              setPage(1);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading customers…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {search || company ? "No customers match your filters." : "No customers yet."}
                </td>
              </tr>
            ) : (
              items.map((customer) => (
                <tr
                  key={customer.id}
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <a
                      href={`/customers/${customer.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        navigate(`/customers/${customer.id}`);
                      }}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {customer.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{customer.email}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{customer.company ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {customer.last_contacted_at ? (
                      formatDate(customer.last_contacted_at)
                    ) : (
                      <span className="text-slate-400">Never</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span>
            {total === 0
              ? "No results"
              : `Showing ${from}–${to} of ${total}`}
            {pageCount > 1 && ` · Page ${currentPage} of ${pageCount}`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-16">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <CustomerForm
              title="Add customer"
              submitLabel="Save"
              onSubmit={createCustomer}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
