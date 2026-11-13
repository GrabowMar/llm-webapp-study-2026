import { useCallback, useEffect, useState } from "react";
import {
  createStore,
  deleteStore,
  getToken,
  listStores,
  login,
  setToken,
  updateStore,
} from "./api";
import type { ApiError } from "./api";
import type { Store, StoreInput, LatLng } from "./types";
import Plot from "./Plot";
import StoreForm from "./StoreForm";

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [visitor, setVisitor] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState(10);
  const [locError, setLocError] = useState<string | null>(null);

  const [token, setTokenState] = useState<string | null>(getToken());
  const [authError, setAuthError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [editing, setEditing] = useState<Store | null>(null);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { q?: string; lat?: number; lng?: number; radius?: number } = {};
      if (search) params.q = search;
      if (visitor) {
        params.lat = visitor.lat;
        params.lng = visitor.lng;
        params.radius = radius;
      }
      const res = await listStores(params);
      setStores(res.items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, visitor, radius]);

  useEffect(() => {
    load();
  }, [load]);

  function handleUseLocation() {
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError("Location is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setVisitor({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocError("Could not access your location, showing all stores."),
    );
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const res = await login(username, password);
      setToken(res.token);
      setTokenState(res.token);
      setPassword("");
    } catch (err) {
      setAuthError((err as ApiError).message);
    }
  }

  function handleLogout() {
    setToken(null);
    setTokenState(null);
    setEditing(null);
    setAdding(false);
  }

  function resetFormState() {
    setFormError(null);
    setFieldErrors({});
    setAdding(false);
    setEditing(null);
  }

  async function handleSubmit(input: StoreInput) {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      if (editing) {
        await updateStore(editing.id, input);
      } else {
        await createStore(input);
      }
      resetFormState();
      await load();
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        setToken(null);
        setTokenState(null);
        setFormError("Your session expired. Please sign in again.");
      } else {
        setFormError(e.data?.error || e.message);
        setFieldErrors(e.data?.errors || {});
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(store: Store) {
    if (!window.confirm(`Delete "${store.name}"?`)) return;
    try {
      await deleteStore(store.id);
      await load();
    } catch (err) {
      const e = err as ApiError;
      if (e.status === 401) {
        setToken(null);
        setTokenState(null);
      } else {
        alert(e.message);
      }
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Store Finder</h1>
          {token ? (
            <button
              onClick={handleLogout}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {!token && (
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">Admin sign in</h2>
            <form onSubmit={handleLogin} className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Username</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Sign in
              </button>
            </form>
            {authError && <p className="mt-3 text-sm text-red-600">{authError}</p>}
          </section>
        )}

        <section className="mb-6 flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(q);
            }}
            placeholder="Search by name or address"
            className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={() => setSearch(q)}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Search
          </button>
          <button
            onClick={handleUseLocation}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Use my location
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Radius
            <select
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              {[1, 5, 10, 25, 50, 100, 250].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        </section>

        {locError && <p className="mb-4 text-sm text-amber-700">{locError}</p>}

        {visitor && (
          <p className="mb-4 text-sm text-slate-600">
            Showing stores within {radius} km of your location.
          </p>
        )}

        <Plot stores={stores} visitor={visitor} />

        {token && (
          <section className="mt-8">
            {adding || editing ? (
              <StoreForm
                initial={editing ?? undefined}
                error={formError}
                fieldErrors={fieldErrors}
                submitting={submitting}
                onSubmit={handleSubmit}
                onCancel={resetFormState}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Add store
              </button>
            )}
          </section>
        )}

        <section className="mt-8">
          {loading ? (
            <p className="text-sm text-slate-500">Loading stores…</p>
          ) : stores.length === 0 ? (
            <p className="text-sm text-slate-500">No stores found.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {stores.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-4 px-5 py-4">
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.name}</h3>
                    <p className="text-sm text-slate-600">{s.address}</p>
                    {s.phone && <p className="text-sm text-slate-500">{s.phone}</p>}
                    {s.distance_km != null && (
                      <p className="mt-1 text-sm font-medium text-indigo-600">
                        {s.distance_km.toFixed(1)} km away
                      </p>
                    )}
                  </div>
                  {token && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => {
                          setEditing(s);
                          setAdding(false);
                          setFormError(null);
                          setFieldErrors({});
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
