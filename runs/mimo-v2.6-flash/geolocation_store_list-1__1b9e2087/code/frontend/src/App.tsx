import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, storesUrl, type GeoPoint, type Store } from "./api";
import StoreForm from "./components/StoreForm";
import StoreList from "./components/StoreList";
import StorePlot from "./components/StorePlot";

const TOKEN_KEY = "storefinder_token";
const RADIUS_OPTIONS = [1, 5, 10, 25, 50, 100];

interface Me {
  username: string;
  admin: boolean;
}

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [radius, setRadius] = useState(10);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [me, setMe] = useState<Me | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);

  const isAdmin = Boolean(me?.admin);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!token) {
      setMe(null);
      return;
    }
    let cancelled = false;
    api
      .get<Me>("/api/auth/me", token)
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setMe(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const reload = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ items: Store[] }>(storesUrl(debouncedQuery, position, radius))
      .then((data) => {
        if (!cancelled) {
          setStores(data.items);
          setListError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setStores([]);
          setListError(
            err instanceof ApiError ? err.message : "Could not load stores. Please retry.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, position, radius]);

  useEffect(() => reload(), [reload, version]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError(null);
    try {
      const data = await api.post<{ token: string }>("/api/auth/login", {
        username,
        password,
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      setPassword("");
      setToken(data.token);
    } catch (err) {
      setAuthError(
        err instanceof ApiError ? err.message : "Sign-in failed. Please try again.",
      );
    } finally {
      setSigningIn(false);
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMe(null);
    setAuthError(null);
    setShowForm(false);
    setEditing(null);
  }

  function handleUseLocation() {
    if (!("geolocation" in navigator)) {
      setGeoNote("Location is not supported here — showing the full list.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoNote(null);
      },
      (err) => {
        setPosition(null);
        setGeoNote(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — showing the full list."
            : "Could not get your location — showing the full list.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function deleteStore(store: Store) {
    if (!token) return;
    if (!window.confirm(`Delete "${store.name}"? This cannot be undone.`)) return;
    try {
      await api.del(`/api/admin/stores/${store.id}`, token);
      setVersion((v) => v + 1);
    } catch (err) {
      setListError(
        err instanceof ApiError ? err.message : "Could not delete the store.",
      );
    }
  }

  function startAdd() {
    setEditing(null);
    setShowForm(true);
  }

  function startEdit(store: Store) {
    setEditing(store);
    setShowForm(true);
  }

  function formSaved() {
    setVersion((v) => v + 1);
    setShowForm(false);
    setEditing(null);
  }

  const emptyMessage = position
    ? `No stores within ${radius} km of your location.`
    : debouncedQuery
      ? "No stores match your search."
      : "No stores in the directory.";

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Store Finder</h1>
            <p className="text-sm text-slate-500">
              Browse the directory or find stores near you.
            </p>
          </div>

          {me ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <span className="font-semibold">{me.username}</span>
                {me.admin && (
                  <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    admin
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={signIn} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Username
                  </span>
                  <input
                    className={`${inputClass} w-36`}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Password
                  </span>
                  <input
                    className={`${inputClass} w-36`}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <button
                  type="submit"
                  disabled={signingIn}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {signingIn ? "Signing in…" : "Sign in"}
                </button>
              </div>
              {authError && (
                <p role="alert" className="text-right text-sm text-red-600">
                  {authError}
                </p>
              )}
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Search
              </span>
              <input
                type="search"
                className={inputClass}
                placeholder="Search by name, address or phone…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleUseLocation}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Use my location
              </button>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                Radius
                <select
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none"
                  value={radius}
                  disabled={!position}
                  onChange={(e) => setRadius(Number(e.target.value))}
                >
                  {RADIUS_OPTIONS.map((km) => (
                    <option key={km} value={km}>
                      {km} km
                    </option>
                  ))}
                </select>
              </label>

              {position && (
                <button
                  type="button"
                  onClick={() => setPosition(null)}
                  className="text-sm text-slate-500 underline hover:text-slate-700"
                >
                  Clear location
                </button>
              )}
            </div>

            {geoNote && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {geoNote}
              </p>
            )}
            {position && (
              <p className="mt-3 text-sm text-slate-500">
                Showing stores within {radius} km of your location, nearest first.
              </p>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-4">
              {showForm ? (
                <StoreForm
                  token={token!}
                  initial={editing}
                  onSaved={formSaved}
                  onCancel={() => {
                    setShowForm(false);
                    setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={startAdd}
                  className="self-start rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Add store
                </button>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Stores
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? "…" : `${stores.length} listed`}
            </span>
          </div>

          <StoreList
            stores={stores}
            loading={loading}
            error={listError}
            admin={isAdmin}
            onEdit={startEdit}
            onDelete={deleteStore}
            emptyMessage={emptyMessage}
          />
        </section>

        <section className="lg:sticky lg:top-6">
          <StorePlot stores={stores} position={position} />
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-400">
        Store directory API served under /api.
      </footer>
    </div>
  );
}
