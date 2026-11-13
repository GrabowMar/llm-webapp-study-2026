import { useEffect, useState } from "react";
import {
  ApiError,
  deleteStore,
  getToken,
  listStores,
  login,
  setToken,
  type Store,
} from "./api";
import { StorePlot } from "./StorePlot";
import { StoreForm } from "./StoreForm";

const RADII = [5, 10, 25, 50, 100, 500];

export default function App() {
  const [isAdmin, setIsAdmin] = useState(
    () => localStorage.getItem("storefinder.user") === "admin" && !!getToken(),
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(50);
  const [geoNote, setGeoNote] = useState<string | null>(null);

  const [editing, setEditing] = useState<Store | "new" | null>(null);

  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listStores({ q, lat: coords?.lat, lng: coords?.lng, radius })
      .then((res) => {
        if (cancelled) return;
        setStores(res.items);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, coords, radius, fetchKey]);

  function useMyLocation() {
    setGeoNote(null);
    if (!navigator.geolocation) {
      setGeoNote("Location is not supported by this browser — showing the full list.");
      setCoords(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
        });
      },
      () => {
        setCoords(null);
        setGeoNote("Location permission denied — showing the full list.");
      },
      { timeout: 10000 },
    );
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSigningIn(true);
    setSignInError(null);
    try {
      const res = await login(username.trim(), password);
      setToken(res.token);
      localStorage.setItem("storefinder.user", username.trim().toLowerCase());
      if (username.trim().toLowerCase() === "admin") setIsAdmin(true);
      setPassword("");
    } catch (err) {
      setSignInError(
        err instanceof ApiError ? err.message : "Sign-in failed. Try again.",
      );
    } finally {
      setSigningIn(false);
    }
  }

  function signOut() {
    setToken(null);
    localStorage.removeItem("storefinder.user");
    setIsAdmin(false);
    setEditing(null);
  }

  async function handleDelete(store: Store) {
    if (!window.confirm(`Delete "${store.name}"? This cannot be undone.`)) return;
    try {
      await deleteStore(store.id);
      setFetchKey((k) => k + 1);
      if (editing && editing !== "new" && editing.id === store.id) setEditing(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const visitor = coords;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 text-white shadow">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Store Finder</h1>
            <p className="text-sm text-slate-300">
              Browse the directory or search near you.
            </p>
          </div>
          {isAdmin ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 font-medium text-emerald-300">
                Signed in as admin
              </span>
              <button
                onClick={signOut}
                className="rounded-md bg-slate-700 px-3 py-1.5 font-medium hover:bg-slate-600"
              >
                Sign out
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSignIn}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="w-32 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm placeholder-slate-400 focus:border-sky-400 focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="w-32 rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm placeholder-slate-400 focus:border-sky-400 focus:outline-none"
              />
              <button
                disabled={signingIn || !username || !password}
                className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {signingIn ? "Signing in…" : "Sign in"}
              </button>
              {signInError && (
                <p className="w-full text-xs text-rose-300">{signInError}</p>
              )}
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="space-y-4">
          <div className="rounded-lg bg-white p-4 shadow">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search stores…"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <button
                onClick={useMyLocation}
                className="whitespace-nowrap rounded-md bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Use my location
              </button>
              <label className="flex items-center gap-1 text-sm text-slate-600">
                within
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  disabled={!coords}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
                >
                  {RADII.map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {coords && (
              <button
                onClick={() => {
                  setCoords(null);
                  setGeoNote(null);
                }}
                className="mt-2 text-xs text-sky-600 hover:underline"
              >
                Clear location filter
              </button>
            )}
            {geoNote && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {geoNote}
              </p>
            )}
            {loadError && (
              <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {loadError}
              </p>
            )}
          </div>

          {isAdmin && !editing && (
            <button
              onClick={() => setEditing("new")}
              className="w-full rounded-md border-2 border-dashed border-slate-300 bg-white py-2 text-sm font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-600"
            >
              + Add store
            </button>
          )}
          {isAdmin && editing && (
            <StoreForm
              store={editing === "new" ? null : editing}
              onSaved={() => {
                setEditing(null);
                setFetchKey((k) => k + 1);
              }}
              onCancel={() => setEditing(null)}
            />
          )}

          <div className="rounded-lg bg-white shadow">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {coords ? "Nearby stores" : "All stores"}
              </h2>
              <span className="text-xs text-slate-400">
                {loading ? "loading…" : `${stores.length} store${stores.length === 1 ? "" : "s"}`}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {stores.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {s.name}
                        {s.distance_km !== null && (
                          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                            {s.distance_km} km
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-600">{s.address}</p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {s.phone ?? (
                          <span className="italic text-slate-400">no phone</span>
                        )}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => setEditing(s)}
                          className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium hover:bg-slate-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-100"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {!loading && stores.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">
                  No stores match your search.
                </li>
              )}
            </ul>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Map (lat / lng plot)
          </h2>
          <div className="rounded-lg bg-white p-3 shadow">
            <StorePlot stores={stores} visitor={visitor} />
          </div>
          <p className="px-1 text-xs text-slate-500">
            <span className="mr-3 inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-500" />
              store
            </span>
            {visitor && (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
                you
              </span>
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
