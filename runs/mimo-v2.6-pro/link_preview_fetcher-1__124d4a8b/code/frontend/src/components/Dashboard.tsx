import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import type { Preview, Session } from "../types";
import AddLinkForm from "./AddLinkForm";
import Pager from "./Pager";
import PreviewCard from "./PreviewCard";

const PAGE_SIZE = 10;

type Props = {
  session: Session;
  onSignOut: () => void;
};

export default function Dashboard({ session, onSignOut }: Props) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof api.ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    },
    [onSignOut],
  );

  const load = useCallback(
    async (target: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.listPreviews(target, PAGE_SIZE);
        setPreviews(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (err) {
        handleError(err);
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const guard = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (err) {
        if (err instanceof api.ApiError && err.status === 401) {
          onSignOut();
          return;
        }
        throw err;
      }
    },
    [onSignOut],
  );

  const handleAdd = useCallback(
    async (url: string) => {
      await guard(async () => {
        await api.createPreview(url);
        await load(1);
      });
    },
    [guard, load],
  );

  const handleRefresh = useCallback(
    async (id: number) => {
      await guard(async () => {
        const updated = await api.refreshPreview(id);
        setPreviews((current) =>
          current.map((preview) => (preview.id === id ? updated : preview)),
        );
      });
    },
    [guard],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      await guard(async () => {
        await api.deletePreview(id);
        const lastPage = Math.max(1, Math.ceil((total - 1) / PAGE_SIZE));
        await load(Math.min(page, lastPage));
      });
    },
    [guard, load, page, total],
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16">
      <header className="flex items-center justify-between gap-4 py-6">
        <h1 className="text-2xl font-bold">Link Previews</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Signed in as <span className="font-semibold">{session.username}</span>
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <AddLinkForm onAdd={handleAdd} />

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="mt-6 flex-1 space-y-4">
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading previews…</p>
        ) : previews.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            No previews yet. Paste a link above to save one.
          </p>
        ) : (
          previews.map((preview) => (
            <PreviewCard
              key={preview.id}
              preview={preview}
              onRefresh={handleRefresh}
              onDelete={handleDelete}
            />
          ))
        )}
      </section>

      {total > 0 && (
        <footer className="mt-8">
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            disabled={loading}
            onChange={(next) => void load(next)}
          />
        </footer>
      )}
    </div>
  );
}
