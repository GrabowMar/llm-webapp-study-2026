import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api";
import type { Preview, Session } from "../types";
import AddLinkForm from "./AddLinkForm";
import Pagination from "./Pagination";
import PreviewCard from "./PreviewCard";

type DashboardProps = {
  session: Session;
  onSignOut: () => void;
  onUnauthorized: () => void;
};

export default function Dashboard({ session, onSignOut, onUnauthorized }: DashboardProps) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage: number, size: number) => {
      setLoading(true);
      try {
        const result = await api.listPreviews(targetPage, size);
        setPreviews(result.items);
        setTotal(result.total);
        setError(null);
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 401) {
          onUnauthorized();
          return;
        }
        setError(caught instanceof Error ? caught.message : "Could not load your saved links.");
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    void load(page, pageSize);
  }, [load, page, pageSize]);

  function handleAdded() {
    setPage(1);
    void load(1, pageSize);
  }

  function handleUpdated(updated: Preview) {
    setPreviews((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
  }

  function handleDeleted(id: number) {
    setPreviews((current) => current.filter((item) => item.id !== id));
    setTotal((current) => Math.max(0, current - 1));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Link previews</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-semibold text-slate-900">{session.username}</span>
            </span>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-rose-300 hover:text-rose-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
        <AddLinkForm onAdded={handleAdded} />

        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {loading && previews.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading your saved links…</p>
        ) : null}

        {!loading && previews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-base font-medium text-slate-700">No links saved yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Paste a link above to create your first preview.
            </p>
          </div>
        ) : null}

        <section className="space-y-4">
          {previews.map((preview) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </section>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </main>
    </div>
  );
}
