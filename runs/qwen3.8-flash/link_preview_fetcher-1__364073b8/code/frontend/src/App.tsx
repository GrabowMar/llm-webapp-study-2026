import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "./api";
import type { Preview } from "./types";
import Header from "./components/Header";
import AddBar from "./components/AddBar";
import PreviewCard from "./components/PreviewCard";
import Pager from "./components/Pager";

const PAGE_SIZE = 10;

export default function App() {
  const [username, setUsername] = useState<string | null>(
    getToken() ? localStorage.getItem("lp.username") : null,
  );
  const [items, setItems] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setListError(null);
    try {
      const data = await api.listPreviews(p, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (username) load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, page]);

  function handleAuthed(name: string) {
    localStorage.setItem("lp.username", name);
    setUsername(name);
    setPage(1);
  }

  function handleSignOut() {
    localStorage.removeItem("lp.username");
    setUsername(null);
    setItems([]);
    setTotal(0);
    setPage(1);
  }

  async function handleAdd(url: string) {
    setAdding(true);
    setAddError(null);
    try {
      const preview = await api.createPreview(url);
      if (page === 1) {
        setItems((prev) => [preview, ...prev].slice(0, PAGE_SIZE));
        setTotal((t) => t + 1);
      } else {
        load(1);
        setPage(1);
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add link");
    } finally {
      setAdding(false);
    }
  }

  async function handleRefresh(id: number) {
    setBusyId(id);
    try {
      const updated = await api.refreshPreview(id);
      setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to refresh link");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    setBusyId(id);
    try {
      await api.deletePreview(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (items.length === 1 && page > 1) {
        setPage((p) => p - 1);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to delete link");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <Header username={username} onAuthed={handleAuthed} onSignOut={handleSignOut} />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {username ? (
          <>
            <AddBar busy={adding} error={addError} onSubmit={handleAdd} />
            <div className="mt-6 flex flex-col gap-4">
              {listError && <p className="text-sm text-red-600">{listError}</p>}
              {loading && items.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
              )}
              {!loading && items.length === 0 && !listError && (
                <p className="py-8 text-center text-sm text-slate-500">
                  No links yet. Paste one above to get started.
                </p>
              )}
              {items.map((preview) => (
                <PreviewCard
                  key={preview.id}
                  preview={preview}
                  busy={busyId === preview.id}
                  onRefresh={handleRefresh}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            <Pager page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </>
        ) : (
          <p className="py-16 text-center text-sm text-slate-500">
            Sign in or register above to save your first link.
          </p>
        )}
      </main>
    </div>
  );
}
