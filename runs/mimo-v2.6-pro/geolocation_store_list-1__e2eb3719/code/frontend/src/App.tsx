import { useCallback, useEffect, useState } from "react";
import type { FormError, Session, Store, StoreInput } from "./types";
import { ApiError, api, getSavedUsername, getToken, setSession } from "./api";
import SignIn from "./components/SignIn";
import StoreForm from "./components/StoreForm";
import StorePlot from "./components/StorePlot";

const RADII_KM = [5, 10, 25, 50, 100, 250, 500];
const DEFAULT_RADIUS_KM = 50;

export default function App() {
  const [session, setSessionState] = useState<Session | null>(() => {
    const token = getToken();
    const username = getSavedUsername();
    return token !== null && username !== null && username !== "" ? { token, username } : null;
  });

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_KM);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const isAdmin = session?.username.toLowerCase() === "admin";

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setListError(null);
    const params: Record<string, string> = {};
    if (debouncedQuery !== "") params.q = debouncedQuery;
    if (location !== null) {
      params.lat = String(location.lat);
      params.lng = String(location.lng);
      params.radius = String(radius);
    }
    api
      .listStores(params, controller.signal)
      .then((items) => setStores(items))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setListError(err instanceof Error ? err.message : "Could not load stores.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, location, radius, reload]);

  const handleSignIn = useCallback(async (username: string, password: string) => {
    const { token } = await api.login(username, password);
    setSession(token, username);
    setSessionState({ token, username });
  }, []);

  function handleSignOut() {
    setSession(null);
    setSessionState(null);
    setAdding(false);
    setEditing(null);
    setFormError(null);
    setConfirmDeleteId(null);
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoNote("Geolocation is not available in this browser — showing all stores.");
      return;
    }
    setGeoBusy(true);
    setGeoNote(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoBusy(false);
      },
      (err) => {
        setLocation(null);
        setGeoNote(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — showing all stores."
            : "Could not read your location — showing all stores.",
        );
        setGeoBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  function clearLocation() {
    setLocation(null);
    setGeoNote(null);
  }

  async function submitStore(input: StoreInput) {
    try {
      if (editing !== null) {
        await api.updateStore(editing.id, input);
      } else {
        await api.createStore(input);
      }
      setFormError(null);
      setAdding(false);
      setEditing(null);
      setReload((value) => value + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError({ message: err.message, fields: err.fields });
      } else {
        setFormError({ message: "Saving the store failed." });
      }
    }
  }

  async function deleteStore(store: Store) {
    setConfirmDeleteId(null);
    try {
      await api.deleteStore(store.id);
      setReload((value) => value + 1);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Deleting the store failed.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Store finder</h1>
            <p className="text-sm text-slate-500">Browse the store directory and find stores near you.</p>
          </div>
          {session !== null ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-600">
                Signed in as <strong>{session.username}</strong>
                {isAdmin ? " (admin)" : ""}
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <SignIn onSignIn={handleSignIn} />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-56 flex-1 flex-col text-xs font-medium text-slate-600">
              Search stores
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, address or phone"
                className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoBusy}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {geoBusy ? "Locating…" : "Use my location"}
            </button>
            <label className="flex flex-col text-xs font-medium text-slate-600">
              Radius
              <select
                value={radius}
                onChange={(event) => setRadius(Number(event.target.value))}
                disabled={location === null}
                className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
              >
                {RADII_KM.map((value) => (
                  <option key={value} value={value}>
                    within {value} km
                  </option>
                ))}
              </select>
            </label>
            {location !== null && (
              <button
                type="button"
                onClick={clearLocation}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Show all stores
              </button>
            )}
            {isAdmin && !adding && editing === null && (
              <button
                type="button"
                onClick={() => {
                  setAdding(true);
                  setFormError(null);
                }}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Add store
              </button>
            )}
          </div>
          {location !== null && (
            <p className="mt-2 text-xs text-slate-500">
              Showing stores near {location.lat.toFixed(4)}, {location.lng.toFixed(4)} — nearest
              first.
            </p>
          )}
          {geoNote !== null && <p className="mt-2 text-xs font-medium text-amber-700">{geoNote}</p>}
        </section>

        {(adding || editing !== null) && (
          <StoreForm
            key={editing !== null ? `edit-${editing.id}` : "new"}
            initial={editing}
            submitLabel={editing !== null ? "Save changes" : "Add store"}
            error={formError}
            onSubmit={submitStore}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
              setFormError(null);
            }}
          />
        )}

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">Stores</h2>
              <p className="text-xs text-slate-500">
                {loading ? "Loading…" : `${stores.length} store${stores.length === 1 ? "" : "s"}`}
                {location !== null ? " nearby" : ""}
              </p>
            </div>

            {listError !== null && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              >
                {listError}
              </p>
            )}

            {!loading && stores.length === 0 && listError === null && (
              <p className="mt-3 text-sm text-slate-500">No stores found.</p>
            )}

            <ul className="mt-2 divide-y divide-slate-100">
              {stores.map((store) => (
                <li key={store.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-40">
                    <p className="font-semibold text-slate-900">{store.name}</p>
                    <p className="text-sm text-slate-600">{store.address}</p>
                    <p className="text-sm text-slate-500">{store.phone ?? "No phone"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {store.distance_km !== null && (
                      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                        {store.distance_km.toFixed(1)} km
                      </span>
                    )}
                    {isAdmin && confirmDeleteId !== store.id && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(store);
                            setAdding(false);
                            setFormError(null);
                          }}
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(store.id)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {isAdmin && confirmDeleteId === store.id && (
                      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1">
                        <span className="text-xs font-medium text-red-700">Delete {store.name}?</span>
                        <button
                          type="button"
                          onClick={() => deleteStore(store)}
                          className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <StorePlot stores={stores} visitor={location} />
        </div>
      </main>
    </div>
  );
}
