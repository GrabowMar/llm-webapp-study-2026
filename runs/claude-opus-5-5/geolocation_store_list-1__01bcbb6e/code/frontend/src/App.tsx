import { useCallback, useEffect, useState } from "react";
import { ApiError, createStore, deleteStore, listStores, logout, me, updateStore } from "./api";
import type { Session, Store, StoreInput } from "./api";
import LoginForm from "./LoginForm";
import StoreForm from "./StoreForm";
import StorePlot from "./StorePlot";

const SESSION_KEY = "storefinder.session";
const RADII = [5, 10, 25, 50, 100, 250, 500];

type Editing = { mode: "add" } | { mode: "edit"; store: Store } | null;
type Location = { lat: number; lng: number };

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [showLogin, setShowLogin] = useState(false);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 250);
  const [location, setLocation] = useState<Location | null>(null);
  const [radius, setRadius] = useState(25);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = Boolean(session?.is_admin);

  const saveSession = useCallback((s: Session | null) => {
    setSession(s);
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }, []);

  useEffect(() => {
    if (!session) return;
    me(session.token).catch((err) => {
      if (err instanceof ApiError && err.status === 401) saveSession(null);
    });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setLoadError(null);
    listStores({ q, ...(location ? { lat: location.lat, lng: location.lng, radius } : {}) }, ctrl.signal)
      .then((r) => setStores(r.items))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setLoadError(err instanceof ApiError ? err.message : "Could not load stores.");
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [q, location, radius, reloadKey]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function locateMe() {
    setLocationNote(null);
    if (!("geolocation" in navigator)) {
      setLocationNote("Location isn't available in this browser; showing all stores.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setLocation(null);
        setLocationNote(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied; showing all stores."
            : "Couldn't determine your location; showing all stores.",
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  function handleAuthError(err: unknown) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      saveSession(null);
      setEditing(null);
      setNotice("Your session has expired. Please sign in again.");
      return true;
    }
    return false;
  }

  async function submitStore(input: StoreInput) {
    if (!session || !editing) return;
    try {
      const saved =
        editing.mode === "add"
          ? await createStore(session.token, input)
          : await updateStore(session.token, editing.store.id, input);
      setEditing(null);
      setSelectedId(saved.id);
      setNotice(editing.mode === "add" ? `Added “${saved.name}”.` : `Saved “${saved.name}”.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      if (handleAuthError(err)) return;
      throw err;
    }
  }

  async function removeStore(s: Store) {
    if (!session) return;
    if (!window.confirm(`Delete “${s.name}”? This cannot be undone.`)) return;
    try {
      await deleteStore(session.token, s.id);
      setNotice(`Deleted “${s.name}”.`);
      if (editing?.mode === "edit" && editing.store.id === s.id) setEditing(null);
    } catch (err) {
      if (!handleAuthError(err)) {
        setNotice(err instanceof ApiError ? err.message : "Delete failed.");
      }
    }
    setReloadKey((k) => k + 1);
  }

  async function signOut() {
    if (session) logout(session.token).catch(() => undefined);
    saveSession(null);
    setEditing(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight">Store Finder</h1>
          <div className="flex items-center gap-3 text-sm">
            {session ? (
              <>
                <span className="text-slate-600">
                  Signed in as <strong>{session.username}</strong>
                </span>
                <button onClick={signOut} className="rounded px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                  Sign out
                </button>
              </>
            ) : (
              !showLogin && (
                <button
                  onClick={() => setShowLogin(true)}
                  className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                >
                  Admin sign-in
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        {showLogin && !session && (
          <div className="max-w-sm">
            <LoginForm
              onSignedIn={(s) => {
                saveSession(s);
                setShowLogin(false);
                if (!s.is_admin) setNotice("Signed in. Only the admin can edit stores.");
              }}
              onCancel={() => setShowLogin(false)}
            />
          </div>
        )}

        {notice && (
          <div role="status" className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {notice}
          </div>
        )}

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
            Search
            <input
              type="search"
              placeholder="Name or address…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>
          <button
            onClick={locateMe}
            disabled={locating}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {locating ? "Locating…" : location ? "Update my location" : "Use my location"}
          </button>
          {location && (
            <>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Radius
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {RADII.map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => setLocation(null)}
                className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Show all stores
              </button>
            </>
          )}
          {isAdmin && (
            <button
              onClick={() => setEditing({ mode: "add" })}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:ml-auto"
            >
              Add store
            </button>
          )}
        </section>

        {locationNote && <p className="text-sm text-amber-700">{locationNote}</p>}

        {isAdmin && editing && (
          <StoreForm
            key={editing.mode === "edit" ? editing.store.id : "new"}
            initial={editing.mode === "edit" ? editing.store : undefined}
            onSubmit={submitStore}
            onCancel={() => setEditing(null)}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section aria-label="Stores" className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">
              {loading
                ? "Loading…"
                : location
                  ? `${stores.length} store${stores.length === 1 ? "" : "s"} within ${radius} km`
                  : `${stores.length} store${stores.length === 1 ? "" : "s"}`}
            </p>
            {loadError && (
              <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {loadError}
              </p>
            )}
            {!loading && !loadError && stores.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                No stores found{location ? " in this radius" : ""}.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {stores.map((s) => (
                <li
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition ${
                    s.id === selectedId ? "border-orange-400 ring-2 ring-orange-200" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800">{s.name}</h3>
                      <p className="text-sm text-slate-600">{s.address}</p>
                      {s.phone ? (
                        <a href={`tel:${s.phone.replace(/[^0-9+]/g, "")}`} className="text-sm text-blue-700 hover:underline">
                          {s.phone}
                        </a>
                      ) : (
                        <p className="text-sm text-slate-400">No phone</p>
                      )}
                    </div>
                    {s.distance_km != null && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-sm font-medium text-emerald-700">
                        {s.distance_km < 1 ? `${Math.round(s.distance_km * 1000)} m` : `${s.distance_km.toFixed(1)} km`}
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ mode: "edit", store: s });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void removeStore(s);
                        }}
                        className="rounded border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Plot" className="lg:sticky lg:top-4 lg:self-start">
            <StorePlot stores={stores} visitor={location} selectedId={selectedId} onSelect={setSelectedId} />
          </section>
        </div>
      </main>
    </div>
  );
}
