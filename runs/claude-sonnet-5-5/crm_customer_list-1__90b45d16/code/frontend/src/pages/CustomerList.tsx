import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listCompanies, listCustomers, type CustomerPage } from "../api";
import { ErrorBanner, formatDate, inputClass, primaryButton, secondaryButton } from "../ui";

const PAGE_SIZE = 10;

export default function CustomerList() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [companies, setCompanies] = useState<string[]>([]);
  const [data, setData] = useState<CustomerPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ((prev) => {
        const next = search.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    listCompanies().then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCustomers({ q, company, page, page_size: PAGE_SIZE })
      .then((d) => {
        if (cancelled) return;
        const pages = Math.max(1, Math.ceil(d.total / d.page_size));
        if (d.page > pages) setPage(pages);
        else {
          setData(d);
          setError("");
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, company, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
        <Link to="/customers/new" className={primaryButton}>
          Add customer
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="search"
          aria-label="Search customers"
          placeholder="Search name, email, phone or company"
          className={`${inputClass} sm:max-w-sm`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter by company"
          className={`${inputClass} sm:max-w-xs`}
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      )}
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left font-medium text-slate-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Last contacted</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-slate-100 ${loading ? "opacity-60" : ""}`}>
            {data?.items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/customers/${c.id}`} className="text-indigo-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{c.email}</td>
                <td className="px-4 py-3">{c.phone ?? ""}</td>
                <td className="px-4 py-3">{c.company ?? ""}</td>
                <td className="px-4 py-3">{formatDate(c.last_contacted_at)}</td>
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
      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {data.total} customer{data.total === 1 ? "" : "s"} - page {data.page} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              className={secondaryButton}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <button
              className={secondaryButton}
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
