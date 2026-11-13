import { useCallback, useEffect, useState } from "react";
import { api, ApiError, getToken, setToken, type PreviewPage } from "./api";
import AuthForm from "./AuthForm";
import PreviewCard from "./PreviewCard";

const PAGE_SIZE = 9;

function Dashboard({ username, onSignOut }: { username: string; onSignOut: () => void }) {
  const [data, setData] = useState<PreviewPage | null>(null);
  const [page, setPage] = useState(1);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number) => {
      try {
        const result = await api.list(p, PAGE_SIZE);
        const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (p > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(result);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) onSignOut();
        else setError(err instanceof Error ? err.message : "Failed to load");
      }
    },
    [onSignOut],
  );

  useEffect(() => {
    load(page);
  }, [page, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.create(url.trim());
      setUrl("");
      if (page === 1) await load(1);
      else setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add link");
    } finally {
      setAdding(false);
    }
  }

  async function refresh(id: number) {
    setError(null);
    try {
      const updated = await api.refresh(id);
      setData((d) => d && { ...d, items: d.items.map((i) => (i.id === id ? updated : i)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await api.remove(id);
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const pageBtn =
    "rounded-md border border-slate-300 bg-white px-3 py-1 text-sm disabled:opacity-50 hover:bg-slate-50";

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Link previews</h1>
        <div className="flex items-center gap-3 text-sm text-slate-700">
          <span>
            Signed in as <strong data-testid="username">{username}</strong>
          </span>
          <button
            onClick={onSignOut}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <form onSubmit={add} className="mt-6 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a link, e.g. https://example.com"
          aria-label="Link"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {data === null ? (
        <p className="mt-8 text-slate-500">Loading…</p>
      ) : data.items.length === 0 ? (
        <p className="mt-8 text-slate-500">No links saved yet.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <PreviewCard key={p.id} preview={p} onRefresh={refresh} onDelete={remove} />
          ))}
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <nav className="mt-6 flex items-center justify-center gap-3">
          <button className={pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {totalPages}
          </span>
          <button className={pageBtn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </nav>
      )}
    </>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);

  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((r) => setUsername(r.username))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setToken(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const signOut = useCallback(() => {
    if (getToken()) api.logout().catch(() => {});
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <main className="mx-auto max-w-5xl">
        {checking ? (
          <p className="text-slate-500">Loading…</p>
        ) : username ? (
          <Dashboard username={username} onSignOut={signOut} />
        ) : (
          <AuthForm onSignedIn={setUsername} />
        )}
      </main>
    </div>
  );
}
