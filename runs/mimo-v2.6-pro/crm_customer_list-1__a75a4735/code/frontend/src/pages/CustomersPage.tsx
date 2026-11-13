import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listCustomers } from "../api";
import type { Customer } from "../types";
import { Alert, Button, Card, formatDate, Select, Spinner, TextInput } from "../ui";

const PAGE_SIZE = 10;

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    listCustomers({ page: 1, page_size: 1000 })
      .then((list) => {
        if (cancelled) return;
        const names = Array.from(
          new Set(list.items.map((c) => c.company).filter((c): c is string => Boolean(c))),
        ).sort((a, b) => a.localeCompare(b));
        setCompanies(names);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listCustomers({ q: query, company, page, page_size: PAGE_SIZE })
      .then((list) => {
        if (cancelled) return;
        setItems(list.items);
        setTotal(list.total);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load customers");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, company, page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-600">
            {total} {total === 1 ? "customer" : "customers"} in the directory
          </p>
        </div>
        <Link
          to="/customers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add customer
        </Link>
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="search">
              Search
            </label>
            <TextInput
              id="search"
              type="search"
              placeholder="Name, email, phone, company or notes…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-56">
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="company">
              Company
            </label>
            <Select
              id="company"
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All companies</option>
              {companies.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          {(query || company) && (
            <Button
              variant="secondary"
              onClick={() => {
                setSearchInput("");
                setQuery("");
                setCompany("");
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-slate-600">No customers match your filters.</p>
            <Link
              to="/customers/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              Add the first customer
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Name</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Email</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Phone</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Company</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-600">Last contacted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((customer) => (
                  <tr key={customer.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="font-medium text-indigo-600 hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{customer.email ?? "—"}</td>
                    <td className="px-6 py-4 text-slate-700">{customer.phone ?? "—"}</td>
                    <td className="px-6 py-4 text-slate-700">{customer.company ?? "—"}</td>
                    <td className="px-6 py-4 text-slate-700">{formatDate(customer.last_contacted_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!loading && total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            Showing {first}–{last} of {total}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-slate-700">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
