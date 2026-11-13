import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  createStore,
  currentUser,
  deleteStore,
  listStores,
  updateStore,
} from "./api";
import LocationControls from "./components/LocationControls";
import SignInForm from "./components/SignInForm";
import StoreForm from "./components/StoreForm";
import StoreList from "./components/StoreList";
import StorePlot from "./components/StorePlot";
import type { Coords, Session, Store, StoreInput } from "./types";

const TOKEN_KEY = "store-finder.token";
const USERNAME_KEY = "store-finder.username";

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radius, setRadius] = useState(10);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listStores({ q: debouncedQuery, coords, radius });
      setStores(items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load stores.");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, coords, radius]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    currentUser(token)
      .then((user) => {
        setSession({
          token,
          username: user.username,
          isAdmin: Boolean(user.is_admin),
        });
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USERNAME_KEY);
      });
  }, []);

  function handleSignedIn(next: Session) {
    setSession(next);
    setShowSignIn(false);
    window.localStorage.setItem(TOKEN_KEY, next.token);
    window.localStorage.setItem(USERNAME_KEY, next.username);
  }

  function handleSignOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USERNAME_KEY);
    setSession(null);
    setShowAddForm(false);
    setEditing(null);
  }

  function handleLocate() {
    if (!("geolocation" in navigator)) {
      setNote("This browser cannot share a location — showing all stores.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setNote(null);
        setLocating(false);
      },
      (reason) => {
        setNote(
          reason.code === reason.PERMISSION_DENIED
            ? "Location permission denied — showing all stores."
            : "Your location could not be read — showing all stores.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  function handleClearLocation() {
    setCoords(null);
    setNote(null);
  }

  async function handleCreate(values: StoreInput) {
    if (!session) throw new ApiError(401, "Sign in as the admin first.");
    await createStore(session.token, values);
    setShowAddForm(false);
    await loadStores();
  }

  async function handleUpdate(values: StoreInput) {
    if (!session || !editing) throw new ApiError(401, "Sign in as the admin first.");
    await updateStore(session.token, editing.id, values);
    setEditing(null);
    await loadStores();
  }

  async function handleDelete(store: Store) {
    if (!session) throw new ApiError(401, "Sign in as the admin first.");
    await deleteStore(session.token, store.id);
    await loadStores();
  }

  const heading = useMemo(() => {
    if (coords) return `Stores within ${radius} km`;
    if (debouncedQuery) return `Stores matching “${debouncedQuery}”`;
    return "All stores";
  }, [coords, debouncedQuery, radius]);

  const emptyMessage = coords
    ? `No stores within ${radius} km of your location.`
    : "No stores match your search.";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-sm font-bold text-white">
              SF
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight">Store finder</h1>
              <p className="text-xs text-slate-500">Browse the directory, find shops nearby</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {session ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {session.username}
                  {session.isAdmin ? " · admin" : ""}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowSignIn((current) => !current)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                {showSignIn ? "Hide sign-in" : "Admin sign-in"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {showSignIn && !session && (
          <div className="mb-6">
            <SignInForm onSignedIn={handleSignedIn} onCancel={() => setShowSignIn(false)} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="flex flex-col gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Search stores</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Name, address or phone"
                  onChange={(event) => setQuery(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </label>
              <div className="mt-4">
                <LocationControls
                  coords={coords}
                  radius={radius}
                  locating={locating}
                  onLocate={handleLocate}
                  onRadiusChange={setRadius}
                  onClear={handleClearLocation}
                />
              </div>
              {note && (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                  {note}
                </p>
              )}
            </div>

            {session?.isAdmin && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">Manage directory</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm((current) => !current);
                      setEditing(null);
                    }}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                  >
                    {showAddForm ? "Close form" : "Add store"}
                  </button>
                </div>
                {showAddForm && (
                  <div className="mt-4">
                    <StoreForm
                      title="Add a store"
                      submitLabel="Add store"
                      onSubmit={handleCreate}
                      onCancel={() => setShowAddForm(false)}
                    />
                  </div>
                )}
                {editing && (
                  <div className="mt-4">
                    <StoreForm
                      title={`Edit “${editing.name}”`}
                      submitLabel="Save changes"
                      initial={editing}
                      onSubmit={handleUpdate}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
                <span className="text-sm text-slate-500">
                  {loading ? "Loading…" : `${stores.length} ${stores.length === 1 ? "store" : "stores"}`}
                </span>
              </div>
              {error && (
                <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
                  {error}
                </p>
              )}
              <StoreList
                stores={stores}
                isAdmin={Boolean(session?.isAdmin)}
                onEdit={(store) => {
                  setEditing(store);
                  setShowAddForm(false);
                }}
                onDelete={handleDelete}
                emptyMessage={emptyMessage}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-900">Map</h2>
                <span className="text-xs text-slate-500">Latitude / longitude plot</span>
              </div>
              <StorePlot stores={stores} visitor={coords} />
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-900" /> Store
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> You
                </span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
