import { useCallback, useEffect, useState } from "react";
import * as api from "./api";
import { Button, ErrorBanner, Spinner, TextInput } from "./components";
import type { Customer, CustomerListResponse } from "./types";
import { errorParts, formatDate } from "./utils";

const PAGE_SIZE = 10;

export default function CustomerList({
  onOpen,
  onAdd,
}: {
  onOpen: (id: number) => void;
  onAdd: () => void;
}) {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [page, setPage] = useState(1);
  const [companies, setCompanies] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await api.listCustomers({ q, company, page, page_size: PAGE_SIZE });
      setData(result);
    } catch (err) {
      setMessage(errorParts(err).message);
    } finally {
      setLoading(false);
    }
  }, [q, company, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    api
      .listCustomers({ page_size: 100 })
      .then((res) => {
        const set = new Set<string>();
        res.items.forEach((c) => c.company && set.add(c.company));
        setCompanies(Array.from(set).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
  }, [data?.total]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : "…"}
          </p>
        </div>
        <Button onClick={onAdd}>+ Add customer</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="min-w-[220px] flex-1">
          <TextInput
            aria-label="Search customers"
            placeholder="Search name, email, company…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="w-full"
          />
        </div>
        <select
          aria-label="Filter by company"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner message={message} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Phone</th>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Last contacted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data && data.items.length > 0 ? (
                  data.items.map((c: Customer) => (
                    <tr
                      key={c.id}
                      onClick={() => onOpen(c.id)}
                      className="cursor-pointer transition hover:bg-indigo-50"
                    >
                      <td className="px-5 py-3 font-medium text-indigo-700">
                        {c.name}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{c.email}</td>
                      <td className="px-5 py-3 text-slate-600">{c.phone || "—"}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {c.company || "—"}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {formatDate(c.last_contacted_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-slate-500"
                    >
                      No customers found.{" "}
                      <button
                        onClick={onAdd}
                        className="font-semibold text-indigo-600 hover:underline"
                      >
                        Add one
                      </button>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
