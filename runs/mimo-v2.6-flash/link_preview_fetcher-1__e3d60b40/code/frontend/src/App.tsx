import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  TOKEN_KEY,
  USERNAME_KEY,
  createPreview,
  deletePreview,
  listPreviews,
  messageOf,
  refreshPreview,
  type Preview,
  type Session,
} from "./api";
import AddLinkForm from "./components/AddLinkForm";
import AuthPanel from "./components/AuthPanel";
import PreviewList from "./components/PreviewList";

const PAGE_SIZE = 10;

function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  return token && username ? { token, username } : null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [items, setItems] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setSession(null);
    setItems([]);
    setTotal(0);
    setPage(1);
    setListError(null);
  }, []);

  const loadPage = useCallback(
    async (target: number) => {
      setLoading(true);
      setListError(null);
      try {
        const data = await listPreviews(target, PAGE_SIZE);
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          signOut();
          return;
        }
        setListError(messageOf(error));
      } finally {
        setLoading(false);
      }
    },
    [signOut],
  );

  useEffect(() => {
    if (session) {
      void loadPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function handleAuth(next: Session) {
    localStorage.setItem(TOKEN_KEY, next.token);
    localStorage.setItem(USERNAME_KEY, next.username);
    setSession(next);
  }

  async function guard<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) signOut();
      throw error;
    }
  }

  const handleAdd = async (url: string) => {
    await guard(() => createPreview(url));
    await loadPage(1);
  };

  const handleRefresh = async (id: number) => {
    const updated = await guard(() => refreshPreview(id));
    setItems((current) => current.map((item) => (item.id === id ? updated : item)));
  };

  const handleDelete = async (id: number) => {
    await guard(() => deletePreview(id));
    if (items.length === 1 && page > 1) {
      await loadPage(page - 1);
    } else {
      await loadPage(page);
    }
  };

  if (!session) {
    return <AuthPanel onAuth={handleAuth} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-semibold">Link previews</h1>
          <div className="flex items-center gap-3">
            <span className="max-w-40 truncate text-sm text-slate-600">
              {session.username}
            </span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <AddLinkForm onAdd={handleAdd} />
        <PreviewList
          items={items}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          loading={loading}
          error={listError}
          onPageChange={(next) => void loadPage(next)}
          onRefresh={handleRefresh}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}
