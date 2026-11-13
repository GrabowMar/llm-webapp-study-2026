import { useCallback, useEffect, useRef, useState } from "react";
import AuthScreen from "./AuthScreen";
import PreviewCard from "./PreviewCard";
import { LinkIcon } from "./icons";
import {
  ApiError,
  createPreview,
  deletePreview,
  getToken,
  listPreviews,
  me,
  refreshPreview,
  setToken,
} from "./api";
import type { Preview } from "./api";

const PAGE_SIZE = 9;

export default function App() {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [username, setUsername] = useState<string | null>(null);
  const [checking, setChecking] = useState<boolean>(Boolean(getToken()));

  const [previews, setPreviews] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const requestSeq = useRef(0);

  const signOut = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUsername(null);
    setPreviews([]);
    setTotal(0);
    setPage(1);
    setChecking(false);
  }, []);

  const loadPage = useCallback(
    async (targetPage: number) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setListError(null);
      try {
        const data = await listPreviews(targetPage, PAGE_SIZE);
        if (seq !== requestSeq.current) {
          return;
        }
        const lastPage = Math.max(1, Math.ceil(data.total / data.page_size));
        if (data.items.length === 0 && targetPage > lastPage) {
          setPage(lastPage);
          return;
        }
        setPreviews(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (error) {
        if (seq !== requestSeq.current) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          signOut();
          return;
        }
        setListError(
          error instanceof Error ? error.message : "Could not load previews",
        );
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [signOut],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    if (username) {
      return;
    }
    let active = true;
    me()
      .then((data) => {
        if (active) {
          setUsername(data.username);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          signOut();
        } else {
          setChecking(false);
        }
      })
      .finally(() => {
        if (active) {
          setChecking(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token, username, signOut]);

  useEffect(() => {
    if (token && username) {
      void loadPage(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, username, page]);

  function handleAuthenticated(newToken: string) {
    setToken(newToken);
    setTokenState(newToken);
    setUsername(null);
    setChecking(true);
    setPage(1);
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || adding) {
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createPreview(trimmed);
      setUrl("");
      if (page !== 1) {
        setPage(1);
      } else {
        await loadPage(1);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        signOut();
        return;
      }
      setAddError(
        error instanceof Error ? error.message : "Could not add that link",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleRefresh(id: number) {
    try {
      const updated = await refreshPreview(id);
      setPreviews((current) =>
        current.map((item) => (item.id === id ? updated : item)),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        signOut();
        return;
      }
      setListError(
        error instanceof Error ? error.message : "Could not refresh preview",
      );
    }
  }

  async function handleDelete(id: number) {
    try {
      await deletePreview(id);
      const remaining = previews.filter((item) => item.id !== id);
      if (remaining.length === 0 && page > 1) {
        setPage(page - 1);
      } else {
        setPreviews(remaining);
        setTotal((value) => Math.max(0, value - 1));
        await loadPage(page);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        signOut();
        return;
      }
      setListError(
        error instanceof Error ? error.message : "Could not delete preview",
      );
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <div className="flex items-center gap-3 text-slate-300">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-white" />
          Loading…
        </div>
      </div>
    );
  }

  if (!token) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <LinkIcon className="h-5 w-5" />
            </span>
            <h1 className="text-lg font-bold text-slate-900">Link Previews</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as{" "}
              <span className="font-semibold text-slate-900">{username}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <form
          onSubmit={handleAdd}
          className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <LinkIcon className="h-4 w-4" />
              </span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="Paste a link to save…"
                required
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              />
            </div>
            <button
              type="submit"
              disabled={adding || !url.trim()}
              className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-white" />
              )}
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {addError}
            </p>
          )}
        </form>

        {listError && (
          <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {listError}
          </p>
        )}

        {loading && previews.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white"
              />
            ))}
          </div>
        ) : previews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-lg font-semibold text-slate-700">
              No previews yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Paste a link above to save your first one.
            </p>
          </div>
        ) : (
          <div
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
              loading ? "opacity-60" : ""
            }`}
          >
            {previews.map((preview) => (
              <PreviewCard
                key={preview.id}
                preview={preview}
                onRefresh={handleRefresh}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="mt-8 flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages} · {total}{" "}
              {total === 1 ? "preview" : "previews"}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={page >= totalPages || loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
