import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createStore,
  deleteStore,
  listStores,
  login,
  updateStore,
  type Store,
  type StoreInput,
} from "./api";

const RADIUS_OPTIONS = [1, 5, 10, 25, 50, 100, 250, 500];

type Coords = { lat: number; lng: number };

type GeoState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "ready"; coords: Coords }
  | { status: "denied" };

const emptyForm: StoreInput = {
  name: "",
  address: "",
  phone: "",
  latitude: "",
  longitude: "",
};

function formFromStore(store: Store): StoreInput {
  return {
    name: store.name,
    address: store.address,
    phone: store.phone ?? "",
    latitude: String(store.latitude),
    longitude: String(store.longitude),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.errors : {};
}

export default function App() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [radius, setRadius] = useState(25);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("storefinder.token"),
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const coords = geo.status === "ready" ? geo.coords : null;

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const data = await listStores({
        q: debouncedQuery || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        radius: coords ? radius : undefined,
      });
      if (id === requestId.current) setStores(data.items);
    } catch (error) {
      if (id === requestId.current) setLoadError(errorMessage(error));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, coords?.lat, coords?.lng, radius]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setGeo({ status: "denied" });
      return;
    }
    setGeo({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeo({
          status: "ready",
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
      },
      () => setGeo({ status: "denied" }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const clearLocation = () => setGeo({ status: "idle" });

  const handleLogin = async (username: string, password: string) => {
    const result = await login(username, password);
    setToken(result.token);
    localStorage.setItem("storefinder.token", result.token);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("storefinder.token");
    setSelectedId(null);
  };

  const selectedStore = stores.find((store) => store.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Store Finder</h1>
            <p className="text-sm text-slate-300">
              Browse the directory or find stores near you.
            </p>
          </div>
          <AdminSession token={token} onLogin={handleLogin} onLogout={handleLogout} />
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <section className="space-y-5">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <label htmlFor="search" className="mb-1 block text-sm font-medium">
              Search
            </label>
            <input
              id="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, address or phone"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={useMyLocation}
                disabled={geo.status === "locating"}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {geo.status === "locating" ? "Locating…" : "Use my location"}
              </button>
              {geo.status === "ready" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    Radius
                    <select
                      value={radius}
                      onChange={(event) => setRadius(Number(event.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                    >
                      {RADIUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option} km
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={clearLocation}
                    className="text-sm text-slate-600 underline hover:text-slate-900"
                  >
                    Clear location
                  </button>
                </>
              )}
            </div>
            {geo.status === "denied" && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Location permission was denied, so the plain store list is shown.
              </p>
            )}
            {geo.status === "ready" && (
              <p className="mt-3 text-xs text-slate-500">
                Showing stores within {radius} km of your location, nearest first.
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Loading stores…</p>
            ) : loadError ? (
              <p className="p-4 text-sm text-red-600">{loadError}</p>
            ) : stores.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No stores found.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {stores.map((store) => (
                  <li
                    key={store.id}
                    className={`flex items-start justify-between gap-4 p-4 ${
                      selectedId === store.id ? "bg-slate-50" : ""
                    }`}
                  >
                    <div>
                      <p className="font-medium">{store.name}</p>
                      <p className="text-sm text-slate-600">{store.address}</p>
                      <p className="text-sm text-slate-500">
                        {store.phone ?? "No phone"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      {store.distance_km !== null && (
                        <p className="font-medium text-slate-700">
                          {store.distance_km.toFixed(1)} km
                        </p>
                      )}
                      <div className="mt-1 flex flex-col items-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedId(selectedId === store.id ? null : store.id)
                          }
                          className="text-xs text-slate-500 underline hover:text-slate-800"
                        >
                          {selectedId === store.id ? "Hide on map" : "Show on map"}
                        </button>
                        {token && (
                          <button
                            type="button"
                            onClick={() => setSelectedId(store.id)}
                            className="text-xs text-slate-500 underline hover:text-slate-800"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <StorePlot
            stores={stores}
            visitor={coords}
            highlightId={selectedId}
            onSelect={setSelectedId}
          />
          {token && (
            <AdminPanel
              token={token}
              selectedStore={selectedStore}
              onChanged={refresh}
              onClearSelection={() => setSelectedId(null)}
            />
          )}
        </aside>
      </main>
    </div>
  );
}

function AdminSession({
  token,
  onLogin,
  onLogout,
}: {
  token: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (token) {
    return (
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
      >
        Sign out
      </button>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(username, password);
      setPassword("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="admin-username" className="block text-xs text-slate-300">
          Admin username
        </label>
        <input
          id="admin-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-32 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-slate-400"
        />
      </div>
      <div>
        <label htmlFor="admin-password" className="block text-xs text-slate-300">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-36 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-slate-400"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && <p className="w-full text-xs text-red-300">{error}</p>}
    </form>
  );
}

function StorePlot({
  stores,
  visitor,
  highlightId,
  onSelect,
}: {
  stores: Store[];
  visitor: Coords | null;
  highlightId: number | null;
  onSelect: (id: number) => void;
}) {
  const points = useMemo(() => {
    const all: { lat: number; lng: number; label: string; id?: number }[] = stores.map(
      (store) => ({
        lat: store.latitude,
        lng: store.longitude,
        label: store.name,
        id: store.id,
      }),
    );
    if (visitor) all.push({ lat: visitor.lat, lng: visitor.lng, label: "You" });
    if (all.length === 0) return [];

    let minLat = Math.min(...all.map((point) => point.lat));
    let maxLat = Math.max(...all.map((point) => point.lat));
    let minLng = Math.min(...all.map((point) => point.lng));
    let maxLng = Math.max(...all.map((point) => point.lng));

    const latSpan = maxLat - minLat || 0.02;
    const lngSpan = maxLng - minLng || 0.02;
    const latPad = latSpan * 0.15;
    const lngPad = lngSpan * 0.15;
    minLat -= latPad;
    maxLat += latPad;
    minLng -= lngPad;
    maxLng += lngPad;

    return all.map((point) => ({
      ...point,
      x: ((point.lng - minLng) / (maxLng - minLng)) * 100,
      y: (1 - (point.lat - minLat) / (maxLat - minLat)) * 100,
    }));
  }, [stores, visitor]);

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold">Map plot</h2>
      {points.length === 0 ? (
        <p className="text-sm text-slate-500">No stores to plot.</p>
      ) : (
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label="Plot of stores by latitude and longitude"
          className="aspect-square w-full rounded-lg border border-slate-200 bg-slate-50"
        >
          {[20, 40, 60, 80].map((value) => (
            <g key={value}>
              <line
                x1={value}
                y1={0}
                x2={value}
                y2={100}
                stroke="#e2e8f0"
                strokeWidth={0.3}
              />
              <line
                x1={0}
                y1={value}
                x2={100}
                y2={value}
                stroke="#e2e8f0"
                strokeWidth={0.3}
              />
            </g>
          ))}
          {points.map((point) =>
            point.id === undefined ? (
              <g key="visitor">
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={2.4}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
                <text
                  x={point.x + 3}
                  y={point.y + 1.2}
                  fontSize={2.6}
                  fill="#1d4ed8"
                >
                  You
                </text>
              </g>
            ) : (
              <g
                key={point.id}
                onClick={() => onSelect(point.id!)}
                className="cursor-pointer"
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={highlightId === point.id ? 2.8 : 2}
                  fill={highlightId === point.id ? "#dc2626" : "#0f172a"}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
                <title>{point.label}</title>
              </g>
            ),
          )}
        </svg>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {visitor
          ? "Blue dot is you; dark dots are stores."
          : "Dots are stores plotted by latitude and longitude."}
      </p>
    </div>
  );
}

function AdminPanel({
  token,
  selectedStore,
  onChanged,
  onClearSelection,
}: {
  token: string;
  selectedStore: Store | null;
  onChanged: () => Promise<void>;
  onClearSelection: () => void;
}) {
  const [form, setForm] = useState<StoreInput>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selectedStore) {
      setForm(formFromStore(selectedStore));
      setErrors({});
      setMessage("");
    } else {
      setForm(emptyForm);
    }
  }, [selectedStore]);

  const setField = (field: keyof StoreInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      if (selectedStore) {
        await updateStore(token, selectedStore.id, form);
        setMessage("Store updated.");
      } else {
        await createStore(token, form);
        setMessage("Store added.");
        setForm(emptyForm);
      }
      await onChanged();
    } catch (caught) {
      setErrors(fieldErrors(caught));
      setMessage(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedStore) return;
    if (!window.confirm(`Delete "${selectedStore.name}"? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage("");
    try {
      await deleteStore(token, selectedStore.id);
      onClearSelection();
      setMessage("Store deleted.");
      await onChanged();
    } catch (caught) {
      setMessage(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const fields: {
    key: keyof StoreInput;
    label: string;
    type?: string;
    step?: string;
  }[] = [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "phone", label: "Phone" },
    { key: "latitude", label: "Latitude", type: "number", step: "any" },
    { key: "longitude", label: "Longitude", type: "number", step: "any" },
  ];

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          {selectedStore ? `Edit: ${selectedStore.name}` : "Add a store"}
        </h2>
        {selectedStore && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-xs text-slate-500 underline hover:text-slate-800"
          >
            New store
          </button>
        )}
      </div>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={`store-${field.key}`} className="block text-xs font-medium">
              {field.label}
            </label>
            <input
              id={`store-${field.key}`}
              type={field.type ?? "text"}
              step={field.step}
              value={form[field.key]}
              onChange={(event) => setField(field.key, event.target.value)}
              className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200 ${
                errors[field.key] ? "border-red-400" : "border-slate-300"
              }`}
            />
            {errors[field.key] && (
              <p className="mt-1 text-xs text-red-600">{errors[field.key]}</p>
            )}
          </div>
        ))}
        {errors.body && <p className="text-xs text-red-600">{errors.body}</p>}
        {message && (
          <p
            className={`text-xs ${
              Object.keys(errors).length > 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {selectedStore ? "Save changes" : "Add store"}
          </button>
          {selectedStore && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
