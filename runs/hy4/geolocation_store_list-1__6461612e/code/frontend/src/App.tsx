import { useCallback, useEffect, useState } from "react";
import Plot from "./Plot";
import StoreForm from "./StoreForm";
import {
  api,
  emptyDraft,
  getStores,
  storeToDraft,
  type ApiError,
  type Store,
  type StoreDraft,
} from "./api";

const TOKEN_KEY = "storefinder.token";
const RADII = [1, 5, 10, 25, 50, 100];

type Location = { lat: number; lng: number };

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [radius, setRadius] = useState(10);
  const [location, setLocation] = useState<Location | null>(null);
  const [locationNote, setLocationNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [listError, setListError] = useState("");
  const [loading, setLoading] = useState(true);

  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [editing, setEditing] = useState<{ id?: number; draft: StoreDraft; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Store | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = token !== null;

  const refresh = useCallback(async () => {
    setListError("");
    try {
      const items = await getStores({
        q: query.trim() || undefined,
        lat: location?.lat,
        lng: location?.lng,
        radius: location ? radius : undefined,
      });
      setStores(items);
    } catch (err) {
      const e = err as ApiError;
      setListError(e.errors ? Object.values(e.errors).join(" ") : e.error ?? "Could not load stores.");
    } finally {
      setLoading(false);
    }
  }, [query, location, radius]);

  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [refresh, query]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const result = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setPassword("");
      setLoginOpen(false);
    } catch (err) {
      const e = err as ApiError;
      setLoginError(e.error ?? "Sign in failed. Check your username and password.");
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setEditing(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocationNote("Your browser does not support location; showing the full list.");
      setLocation(null);
      return;
    }
    setLocating(true);
    setLocationNote("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocation(null);
        setLocationNote("Location permission was denied, so the plain list is shown.");
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }

  async function confirmDelete() {
    if (!deleteTarget || !token) return;
    setDeleting(true);
    try {
      await api(`/api/admin/stores/${deleteTarget.id}`, { method: "DELETE" }, token);
      setDeleteTarget(null);
      await refresh();
    } catch {
      setDeleteTarget(null);
      setListError("Could not delete the store.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Store Finder</h1>
            <p className="text-sm text-slate-500">Browse our directory and find stores near you.</p>
          </div>
          <div>
            {isAdmin ? (
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">Signed in as admin</span>
                <button onClick={logout} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Sign out</button>
              </div>
            ) : (
              <button onClick={() => { setLoginOpen((v) => !v); setLoginError(""); }} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Admin sign in</button>
            )}
          </div>
          {loginOpen && !isAdmin && (
            <form onSubmit={login} className="w-full space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:w-80">
              <h2 className="text-sm font-semibold text-slate-800">Sign in to manage the directory</h2>
              {loginError && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{loginError}</p>}
              <input aria-label="Username" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
              <input aria-label="Password" type="password" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="submit" disabled={loggingIn} className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{loggingIn ? "Signing in…" : "Sign in"}</button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="search">Search stores</label>
              <input id="search" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Search by name or address…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <button onClick={useMyLocation} disabled={locating} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {locating ? "Locating…" : "Use my location"}
            </button>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="radius">Radius (km)</label>
              <select id="radius" className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                {RADII.map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
            </div>
            {location && (
              <button onClick={() => { setLocation(null); setLocationNote(""); }} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Clear location</button>
            )}
          </div>
          {location && <p className="mt-2 text-sm text-emerald-700">Showing nearby stores within {radius} km, nearest first.</p>}
          {locationNote && <p className="mt-2 text-sm text-amber-700">{locationNote}</p>}
          {isAdmin && (
            <button onClick={() => setEditing({ draft: emptyDraft, title: "Add a store" })} className="mt-3 rounded-md border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">+ Add a store</button>
          )}
        </section>

        {editing && token && (
          <StoreForm
            key={editing.id ?? "new"}
            token={token}
            initial={editing.draft}
            storeId={editing.id}
            title={editing.title}
            submitLabel={editing.id ? "Save changes" : "Add store"}
            onSaved={() => { setEditing(null); void refresh(); }}
            onCancel={() => setEditing(null)}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Stores</h2>
              <span className="text-sm text-slate-500">{stores.length} shown</span>
            </div>
            {listError && <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{listError}</p>}
            {loading ? (
              <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading stores…</p>
            ) : stores.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No stores match your search.</p>
            ) : (
              <ul className="space-y-3">
                {stores.map((store) => (
                  <li key={store.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-800">{store.name}</h3>
                        <p className="text-sm text-slate-600">{store.address}</p>
                        <p className="text-sm text-slate-500">{store.phone || "No phone"}</p>
                        <p className="mt-1 text-xs text-slate-400">{store.latitude.toFixed(4)}, {store.longitude.toFixed(4)}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {store.distance_km !== null && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{store.distance_km.toFixed(1)} km</span>
                        )}
                        {isAdmin && (
                          <div className="flex gap-2">
                            <button onClick={() => setEditing({ id: store.id, draft: storeToDraft(store), title: `Edit ${store.name}` })} className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">Edit</button>
                            <button onClick={() => setDeleteTarget(store)} className="rounded border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50">Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-slate-800">Map</h2>
            <Plot stores={stores} visitor={location} />
          </section>
        </div>
      </main>

      {deleteTarget && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800">Delete store?</h3>
            <p className="mt-2 text-sm text-slate-600">This will permanently remove <strong>{deleteTarget.name}</strong> from the directory.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
