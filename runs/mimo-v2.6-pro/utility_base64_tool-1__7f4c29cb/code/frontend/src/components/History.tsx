import { useCallback, useEffect, useState } from "react";
import {
  deleteConversion,
  listConversions,
  type Conversion,
} from "../api";

interface Props {
  token: string;
  reloadToken: number;
}

const PAGE_SIZE = 10;

function message(err: unknown): string {
  return err instanceof Error ? err.message : "something went wrong";
}

export default function History({ token, reloadToken }: Props) {
  const [items, setItems] = useState<Conversion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [reloadToken]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listConversions(page, PAGE_SIZE, token);
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage, version, reloadToken]);

  const onDelete = async (id: number) => {
    try {
      await deleteConversion(id, token);
      if (items.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        setVersion((v) => v + 1);
      }
    } catch (err) {
      setError(message(err));
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <span className="text-sm text-gray-500">
          {total} conversion{total === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 && !loading ? (
        <p className="py-6 text-center text-sm text-gray-500">
          No saved conversions yet.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-medium " +
                      (c.direction === "encode"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-purple-100 text-purple-700")
                    }
                  >
                    {c.direction === "encode" ? "Encode" : "Decode"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(c.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="break-all font-mono text-xs text-gray-600">
                  <span className="text-gray-400">in:</span> {c.input_preview}
                </p>
                <p className="break-all font-mono text-xs text-gray-600">
                  <span className="text-gray-400">out:</span> {c.output_preview}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                className="shrink-0 rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={loading || page <= 1}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-gray-600">
          Page {page} of {pages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(pages, p + 1))}
          disabled={loading || page >= pages}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </section>
  );
}
