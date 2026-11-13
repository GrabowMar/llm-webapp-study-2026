import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { CustomerList as CustomerListType } from "../api";
import { api } from "../api";
import { formatDate } from "../format";

const PAGE_SIZE = 10;

export default function CustomerList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const company = searchParams.get("company") ?? "";
  const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);

  const [data, setData] = useState<CustomerListType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputQ, setInputQ] = useState(q);
  const [companies, setCompanies] = useState<string[]>([]);

  useEffect(() => {
    setInputQ(q);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    api
      .listCustomers({ q, company, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load customers.");
      });
    return () => {
      cancelled = true;
    };
  }, [q, company, page]);

  useEffect(() => {
    let cancelled = false;
    api
      .listCustomers({ page_size: 100 })
      .then((res) => {
        if (cancelled) return;
        const seen = new Set<string>();
        for (const c of res.items) {
          if (c.company) seen.add(c.company);
        }
        setCompanies([...seen].sort());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function updateParams(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateParams({ q: inputQ, page: undefined });
  }

  const totalPages = data ? Math.max(Math.ceil(data.total / data.page_size), 1) : 1;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Customers</h2>
        <Link
          to="/customers/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Add customer
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex flex-wrap gap-3">
        <input
          value={inputQ}
          onChange={(e) => setInputQ(e.target.value)}
          placeholder="Search name, email, company, phone…"
          className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select
          value={company}
          onChange={(e) => updateParams({ company: e.target.value, page: undefined })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Search
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Last contacted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/customers/${c.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{c.company ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{formatDate(c.last_contacted_at)}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          {data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : "…"}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => updateParams({ page: page > 1 ? String(page - 1) : undefined })}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
