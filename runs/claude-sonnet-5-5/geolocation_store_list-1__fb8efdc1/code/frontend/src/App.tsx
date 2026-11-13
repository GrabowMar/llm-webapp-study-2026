import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteStore, getToken, listStores, setToken, type Store } from "./api";
import SignIn from "./SignIn";
import StoreForm from "./StoreForm";
import StorePlot from "./StorePlot";

const RADII = [1, 5, 10, 25, 50, 100, 500];

export default function App() {
  const [signedIn, setSignedIn] = useState(() => getToken() !== null);
  const [search, setSearch] = useState("");
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [stores, setStores] = useState<Store[]>([]);
  const [loadError, setLoadError] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<Store | "new" | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await listStores({ q: search.trim(), lat: me?.lat, lng: me?.lng, radius });
      setStores(res.items);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not reach the server");
    }
  }, [search, me, radius]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function useMyLocation() {
    setNote("");
    if (!navigator.geolocation) {
      setNote("Location is not available in this browser; showing all stores.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        setMe(null);
        setNote("Location permission was denied; showing the plain list.");
      },
    );
  }

  function signOut() {
    setToken(null);
    setSignedIn(false);
    setEditing(null);
  }

  async function remove(s: Store) {
    if (!window.confirm(`Delete "${s.name}"?`)) return;
    setActionError("");
    try {
      await deleteStore(s.id);
      await load();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) signOut();
      setActionError(err instanceof ApiError ? err.message : "Could not reach the server");
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Store finder</h1>
        {signedIn ? (
          <div className="flex items-center gap-3 text-sm">
            <span>Signed in</span>
            <button onClick={signOut} className="rounded border border-slate-300 px-3 py-1">Sign out</button>
          </div>
        ) : (
          <SignIn onSignedIn={() => setSignedIn(true)} />
        )}
      </header>

      <section className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search stores"
          aria-label="Search stores"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-48 flex-1 rounded border border-slate-300 px-3 py-1.5"
        />
        <button onClick={useMyLocation} className="rounded bg-indigo-600 px-3 py-1.5 text-white">
          Use my location
        </button>
        {me && (
          <>
            <label className="text-sm">
              Radius{" "}
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="rounded border border-slate-300 px-2 py-1"
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
            </label>
            <button onClick={() => setMe(null)} className="text-sm underline">Show all</button>
          </>
        )}
      </section>
      {note && <p className="text-sm text-amber-700" role="status">{note}</p>}
      {loadError && <p className="text-sm text-red-600" role="alert">{loadError}</p>}
      {actionError && <p className="text-sm text-red-600" role="alert">{actionError}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">
              {me ? `Stores within ${radius} km` : "Stores"} ({stores.length})
            </h2>
            {signedIn && (
              <button onClick={() => setEditing("new")} className="rounded border border-slate-300 px-2 py-1 text-sm">
                Add store
              </button>
            )}
          </div>
          {stores.length === 0 ? (
            <p className="text-sm text-slate-500">No stores found.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
              {stores.map((s) => (
                <li key={s.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-sm text-slate-600">{s.address}</div>
                      {s.phone && <div className="text-sm text-slate-600">{s.phone}</div>}
                    </div>
                    {s.distance_km !== null && (
                      <span className="whitespace-nowrap text-sm font-medium text-indigo-700">
                        {s.distance_km.toFixed(1)} km
                      </span>
                    )}
                  </div>
                  {signedIn && (
                    <div className="mt-2 flex gap-2 text-sm">
                      <button onClick={() => setEditing(s)} className="underline">Edit</button>
                      <button onClick={() => remove(s)} className="text-red-600 underline">Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          {signedIn && editing && (
            <StoreForm
              key={editing === "new" ? "new" : editing.id}
              store={editing === "new" ? null : editing}
              onSaved={() => {
                setEditing(null);
                load();
              }}
              onCancel={() => setEditing(null)}
              onAuthLost={signOut}
            />
          )}
          <h2 className="font-semibold">Plot</h2>
          <StorePlot stores={stores} me={me} />
        </section>
      </div>
    </div>
  );
}
