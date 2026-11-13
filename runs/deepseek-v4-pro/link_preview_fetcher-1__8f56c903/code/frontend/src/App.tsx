import { useCallback, useEffect, useState } from "react";

type Preview = {
  id: number;
  url: string;
  final_url: string;
  status_code: number | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  fetched_at: string;
};

type ListResponse = {
  items: Preview[];
  total: number;
  page: number;
  page_size: number;
};

const TOKEN_KEY = "token";
const USERNAME_KEY = "username";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | { error?: string } }> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function AuthScreen({
  onAuthed,
}: {
  onAuthed: (username: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ token?: string; error?: string }>(
        `/api/auth/${mode}`,
        {
          method: "POST",
          body: JSON.stringify({ username, password }),
        },
      );
      if (mode === "register") {
        if (res.ok) {
          setMode("login");
          setPassword("");
          setError("Account created — sign in below.");
          return;
        }
        setError((res.data as { error?: string }).error ?? "Registration failed");
      } else {
        if (res.ok && (res.data as { token?: string }).token) {
          localStorage.setItem(TOKEN_KEY, (res.data as { token: string }).token);
          localStorage.setItem(USERNAME_KEY, username);
          onAuthed(username);
          return;
        }
        setError((res.data as { error?: string }).error ?? "Invalid credentials");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4"
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              mode === "login"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${
              mode === "register"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Register
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {loading
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(getUsername());
  const [token, setToken] = useState<string | null>(getToken());

  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [items, setItems] = useState<Preview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const res = await api<ListResponse>(
        `/api/previews?page=${pageNum}&page_size=${pageSize}`,
      );
      if (res.ok) {
        const data = res.data as ListResponse;
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
      } else if (res.status === 401) {
        signOut();
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
    setItems([]);
    setTotal(0);
  }

  useEffect(() => {
    if (token) load(1);
  }, [token, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setAddError(null);
    setAdding(true);
    try {
      const res = await api<Preview>("/api/previews", {
        method: "POST",
        body: JSON.stringify({ url: url.trim() }),
      });
      if (res.ok) {
        setUrl("");
        await load(1);
      } else if (res.status === 401) {
        signOut();
      } else {
        setAddError((res.data as { error?: string }).error ?? "Could not add link");
      }
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function refresh(id: number) {
    setAddError(null);
    const res = await api<Preview>(`/api/previews/${id}/refresh`, {
      method: "POST",
    });
    if (res.ok) {
      await load(page);
    } else if (res.status === 401) {
      signOut();
    }
  }

  async function remove(id: number) {
    setAddError(null);
    const res = await api(`/api/previews/${id}`, { method: "DELETE" });
    if (res.ok) {
      if (items.length === 1 && page > 1) {
        await load(page - 1);
      } else {
        await load(page);
      }
    } else if (res.status === 401) {
      signOut();
    }
  }

  if (!token || !username) {
    return (
      <AuthScreen
        onAuthed={(name) => {
          setUsername(name);
          setToken(getToken());
        }}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Links</h1>
            <p className="text-sm text-slate-500">Signed in as {username}</p>
          </div>
          <button
            onClick={signOut}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-300"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={add} className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a link (https://…)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="px-5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </form>
        {addError && <p className="text-sm text-red-600">{addError}</p>}

        {loading && items.length === 0 ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No links saved yet.</p>
        ) : (
          <ul className="space-y-4">
            {items.map((p) => (
              <li
                key={p.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="flex">
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-32 h-24 object-cover shrink-0 bg-slate-100"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0 p-4">
                    <a
                      href={p.final_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {p.title || hostOf(p.final_url)}
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {hostOf(p.final_url)}
                    </p>
                    {p.description && (
                      <p className="text-sm text-slate-600 mt-2 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3">
                      <span className="text-xs text-slate-400">
                        {formatDate(p.fetched_at)}
                      </span>
                      <button
                        onClick={() => refresh(p.id)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => remove(p.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between">
            <button
              disabled={page <= 1}
              onClick={() => load(page - 1)}
              className="text-sm font-medium text-slate-600 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => load(page + 1)}
              className="text-sm font-medium text-slate-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
