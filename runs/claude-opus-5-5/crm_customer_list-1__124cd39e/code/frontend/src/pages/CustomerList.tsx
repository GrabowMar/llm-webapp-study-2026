import { useEffect, useState } from "react";
import { api, ApiError, formatDate, type Customer, type Page } from "../api";
import { Alert, Button, Card, Link, Spinner, buttonClass, inputClass } from "../components/ui";
import { navigate } from "../router";

const PAGE_SIZE = 20;

function readParams(search: string) {
  const p = new URLSearchParams(search);
  const page = Number(p.get("page"));
  return {
    q: p.get("q") ?? "",
    company: p.get("company") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function buildSearch(q: string, company: string, page: number) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (company) p.set("company", company);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export default function CustomerList({ search }: { search: string }) {
  const { q, company, page } = readParams(search);
  const [query, setQuery] = useState(q);
  const [data, setData] = useState<Page<Customer> | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => setQuery(q), [q]);

  useEffect(() => {
    if (query.trim() === q) return;
    const t = setTimeout(() => navigate(buildSearch(query.trim(), company, 1), true), 300);
    return () => clearTimeout(t);
  }, [query, q, company]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .listCustomers({ q, company, page, page_size: PAGE_SIZE })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load customers.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q, company, page]);

  useEffect(() => {
    if (!data || data.items.length > 0 || data.total === 0 || page <= 1) return;
    navigate(buildSearch(q, company, Math.max(1, Math.ceil(data.total / data.page_size))), true);
  }, [data, page, q, company]);

  useEffect(() => {
    api
      .listCompanies()
      .then((res) => setCompanies(res.items))
      .catch(() => setCompanies([]));
  }, []);

  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const filtered = Boolean(q || company);
  const companyOptions = company && !companies.some((c) => c.toLowerCase() === company.toLowerCase()) ? [company, ...companies] : companies;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">Everyone on the team can view and edit these customers.</p>
        </div>
        <Link to="/customers/new" className={buttonClass("primary")}>
          + Add customer
        </Link>
      </div>

      <Card className="p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(buildSearch(query.trim(), company, 1), true);
          }}
        >
          <div className="flex-1">
            <label htmlFor="search" className="sr-only">
              Search customers
            </label>
            <input
              id="search"
              type="search"
              placeholder="Search by name, email, phone or company…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={inputClass()}
            />
          </div>
          <div className="sm:w-64">
            <label htmlFor="company-filter" className="sr-only">
              Filter by company
            </label>
            <select
              id="company-filter"
              value={company}
              onChange={(e) => navigate(buildSearch(query.trim(), e.target.value, 1))}
              className={inputClass()}
            >
              <option value="">All companies</option>
              {companyOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {filtered && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                navigate("/");
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </Card>

      {error && <Alert>{error}</Alert>}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Phone</th>
                <th scope="col" className="px-4 py-3">Company</th>
                <th scope="col" className="px-4 py-3">Last contacted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !data ? (
                <tr>
                  <td colSpan={5}>
                    <Spinner />
                  </td>
                </tr>
              ) : data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                    {filtered ? "No customers match your search." : "No customers yet. Add the first one!"}
                  </td>
                </tr>
              ) : (
                data?.items.map((c) => (
                  <tr
                    key={c.id}
                    className={`cursor-pointer hover:bg-slate-50 ${loading ? "opacity-60" : ""}`}
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                      <Link to={`/customers/${c.id}`} className="hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{c.email ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{c.phone ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{c.company ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {c.last_contacted_at ? formatDate(c.last_contacted_at) : <span className="text-slate-400">Never</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 text-sm" aria-label="Pagination">
          <p className="text-slate-600">
            {total === 0 ? "No results" : (
              <>
                Showing <span className="font-medium">{from}</span>–<span className="font-medium">{to}</span> of{" "}
                <span className="font-medium">{total}</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => navigate(buildSearch(q, company, page - 1))}>
              Previous
            </Button>
            <span className="text-slate-600">
              Page {Math.min(page, pages)} of {pages}
            </span>
            <Button variant="secondary" disabled={page >= pages || loading} onClick={() => navigate(buildSearch(q, company, page + 1))}>
              Next
            </Button>
          </div>
        </nav>
      </Card>
    </div>
  );
}
