import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ApiError,
  createReading,
  createSensor,
  currentUser,
  deleteSensor,
  formatTime,
  formatValue,
  getSensor,
  listReadings,
  listSensors,
  login,
  logout,
  register,
  timeAgo,
  type Auth,
  type Reading,
  type Sensor,
} from "./api";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function useHashRoute(): [string, (path: string) => void] {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const onHashChange = () => setPath(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = next;
    setPath(next);
  }, []);
  return [path, navigate];
}

function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-sky-600 text-white hover:bg-sky-700 disabled:bg-sky-300",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  };
  return (
    <button
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        {...props}
      />
    </label>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>
  );
}

function AuthPanel({ onAuth }: { onAuth: (auth: Auth) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const auth = mode === "login" ? await login(username, password) : await register(username, password);
      onAuth(auth);
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto max-w-md">
      <h2 className="mb-1 text-lg font-bold text-slate-900">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Sign in to register sensors and post readings. Everyone can watch the live values.
      </p>
      <div className="mb-4 flex gap-2">
        <button
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === "login" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}
          onClick={() => { setMode("login"); setError(null); }}
        >
          Sign in
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === "register" ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}
          onClick={() => { setMode("register"); setError(null); }}
        >
          Register
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>
    </Card>
  );
}

function RegisterSensorForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      await createSensor({ name, unit, location });
      setName("");
      setUnit("");
      setLocation("");
      setMessage("Sensor registered.");
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-3 text-base font-bold">Register a sensor</h3>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Living room" required />
        <Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C" />
        <Field label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Home" />
        <div className="sm:col-span-3">
          <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Register sensor"}</Button>
        </div>
      </form>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {message && <div className="mt-3"><Notice tone="success">{message}</Notice></div>}
    </Card>
  );
}

function PostReadingForm({
  sensors,
  onPosted,
}: {
  sensors: Sensor[];
  onPosted: () => void;
}) {
  const [sensorId, setSensorId] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sensors.length > 0 && !sensors.some((s) => String(s.id) === sensorId)) {
      setSensorId(String(sensors[0].id));
    }
  }, [sensors, sensorId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const number = Number(value);
    if (!sensorId || value.trim() === "" || !Number.isFinite(number)) {
      setError("Choose a sensor and enter a numeric value.");
      return;
    }
    setBusy(true);
    try {
      await createReading(Number(sensorId), number);
      setValue("");
      setMessage("Reading recorded.");
      onPosted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="mb-3 text-base font-bold">Post a reading</h3>
      {sensors.length === 0 ? (
        <p className="text-sm text-slate-500">Register a sensor first to start posting readings.</p>
      ) : (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            Sensor
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              value={sensorId}
              onChange={(e) => setSensorId(e.target.value)}
            >
              {sensors.map((sensor) => (
                <option key={sensor.id} value={sensor.id}>{sensor.name}</option>
              ))}
            </select>
          </label>
          <Field label="Value" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder="21.5" required />
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Record reading"}</Button>
          </div>
        </form>
      )}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {message && <div className="mt-3"><Notice tone="success">{message}</Notice></div>}
    </Card>
  );
}

function SensorCard({
  sensor,
  now,
  username,
  onDeleted,
  navigate,
}: {
  sensor: Sensor;
  now: number;
  username: string | null;
  onDeleted: () => void;
  navigate: (path: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = username === sensor.owner;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSensor(sensor.id);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button
          className="text-left text-base font-bold text-sky-700 hover:underline"
          onClick={() => navigate(`/sensors/${sensor.id}`)}
        >
          {sensor.name}
        </button>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {sensor.owner}
        </span>
      </div>
      <p className="text-3xl font-bold tabular-nums text-slate-900">
        {formatValue(sensor.last_value, sensor.unit)}
      </p>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{sensor.location || "No location"}</span>
        <span title={sensor.last_updated ? formatTime(sensor.last_updated) : undefined}>
          {timeAgo(sensor.last_updated, now)}
        </span>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => navigate(`/sensors/${sensor.id}`)}>
          View history
        </Button>
        {isOwner && !confirming && (
          <Button variant="danger" className="!px-3 !py-1.5" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        )}
        {isOwner && confirming && (
          <>
            <span className="text-xs text-slate-600">Delete this sensor and its readings?</span>
            <Button variant="danger" className="!px-3 !py-1.5" disabled={busy} onClick={remove}>Yes</Button>
            <Button variant="secondary" className="!px-3 !py-1.5" disabled={busy} onClick={() => setConfirming(false)}>No</Button>
          </>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

function Dashboard({
  sensors,
  now,
  username,
  refresh,
  navigate,
}: {
  sensors: Sensor[];
  now: number;
  username: string | null;
  refresh: () => void;
  navigate: (path: string) => void;
}) {
  const own = useMemo(
    () => (username ? sensors.filter((s) => s.owner === username) : []),
    [sensors, username],
  );

  return (
    <div className="flex flex-col gap-6">
      {username && (
        <div className="grid gap-4 lg:grid-cols-2">
          <RegisterSensorForm onCreated={refresh} />
          <PostReadingForm sensors={own} onPosted={refresh} />
        </div>
      )}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Sensors</h2>
          <span className="text-xs text-slate-500">Auto-refreshes every 10 seconds</span>
        </div>
        {sensors.length === 0 ? (
          <Card className="text-center text-sm text-slate-500">
            No sensors yet. {username ? "Register one above to get started." : "Sign in to register one."}
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sensors.map((sensor) => (
              <SensorCard
                key={sensor.id}
                sensor={sensor}
                now={now}
                username={username}
                onDeleted={refresh}
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SensorPage({
  id,
  username,
  refresh,
  navigate,
}: {
  id: number;
  username: string | null;
  refresh: () => void;
  navigate: (path: string) => void;
}) {
  const [sensor, setSensor] = useState<Sensor | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getSensor(id), listReadings(id, 50)]);
      setSensor(s);
      setReadings(r.items);
      setTotal(r.total);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Sensor not found.");
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
    const timer = window.setInterval(load, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const post = async (event: FormEvent) => {
    event.preventDefault();
    setPostError(null);
    const number = Number(value);
    if (value.trim() === "" || !Number.isFinite(number)) {
      setPostError("Enter a numeric value.");
      return;
    }
    setBusy(true);
    try {
      await createReading(id, number);
      setValue("");
      await load();
      refresh();
    } catch (err) {
      setPostError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteSensor(id);
      refresh();
      navigate("/");
    } catch (err) {
      setPostError(errorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(
    () =>
      [...readings].reverse().map((r) => ({
        time: formatTime(r.recorded_at),
        value: r.value,
      })),
    [readings],
  );

  const isOwner = !!sensor && sensor.owner === username;

  return (
    <div className="flex flex-col gap-6">
      <button className="self-start text-sm font-medium text-sky-700 hover:underline" onClick={() => navigate("/")}>
        ← Back to all sensors
      </button>
      {loading ? (
        <Card>Loading...</Card>
      ) : error ? (
        <Card><Notice tone="error">{error}</Notice></Card>
      ) : sensor ? (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{sensor.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {sensor.location || "No location"} · owned by {sensor.owner}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums">{formatValue(sensor.last_value, sensor.unit)}</p>
                <p className="text-xs text-slate-500">
                  {sensor.last_updated ? `Updated ${formatTime(sensor.last_updated)}` : "No readings yet"}
                </p>
              </div>
            </div>
            {isOwner && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {!confirming ? (
                  <Button variant="danger" className="!px-3 !py-1.5" onClick={() => setConfirming(true)}>Delete sensor</Button>
                ) : (
                  <>
                    <span className="text-sm text-slate-600">Delete this sensor and all its readings?</span>
                    <Button variant="danger" className="!px-3 !py-1.5" disabled={busy} onClick={remove}>Yes, delete</Button>
                    <Button variant="secondary" className="!px-3 !py-1.5" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
                  </>
                )}
                {postError && <Notice tone="error">{postError}</Notice>}
              </div>
            )}
          </Card>

          {isOwner && (
            <Card>
              <h3 className="mb-3 text-base font-bold">Post a reading</h3>
              <form onSubmit={post} className="flex flex-wrap items-end gap-3">
                <div className="w-48">
                  <Field label="Value" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder="21.5" required />
                </div>
                <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Record reading"}</Button>
              </form>
              {postError && <div className="mt-3"><Notice tone="error">{postError}</Notice></div>}
            </Card>
          )}

          <Card>
            <h3 className="mb-4 text-base font-bold">Recent readings</h3>
            {chartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No readings recorded yet.</p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
                    <YAxis tick={{ fontSize: 11 }} width={55} domain={["auto", "auto"]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" name={sensor.unit || "Value"} stroke="#0284c7" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card className="!p-0">
            <div className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">
              Readings ({total} total, showing {readings.length})
            </div>
            {readings.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-slate-500">No readings recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-2 font-semibold">Value</th>
                      <th className="px-5 py-2 font-semibold">Recorded at</th>
                      <th className="px-5 py-2 font-semibold">ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {readings.map((reading) => (
                      <tr key={reading.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2 font-medium tabular-nums">{formatValue(reading.value, sensor.unit)}</td>
                        <td className="px-5 py-2 text-slate-600">{formatTime(reading.recorded_at)}</td>
                        <td className="px-5 py-2 text-slate-400">#{reading.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [path, navigate] = useHashRoute();

  const refresh = useCallback(async () => {
    try {
      setSensors((await listSensors()).items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    currentUser().then((username) => {
      setAuth(username ? { token: "", username } : null);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const signOut = () => {
    logout();
    setAuth(null);
  };

  const match = /^\/sensors\/(\d+)$/.exec(path);
  const sensorId = match ? Number(match[1]) : null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <button className="flex items-center gap-2 text-lg font-bold" onClick={() => navigate("/")}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-sm text-white">SD</span>
            Sensor Dashboard
          </button>
          {authChecked && (
            auth ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600">
                  Signed in as <strong className="text-slate-900">{auth.username}</strong>
                </span>
                <Button variant="secondary" className="!px-3 !py-1.5" onClick={signOut}>Sign out</Button>
              </div>
            ) : (
              <span className="text-sm text-slate-500">Viewing as guest</span>
            )
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {!authChecked ? (
          <Card>Loading...</Card>
        ) : (
          <>
            {!auth && <AuthPanel onAuth={setAuth} />}
            {error && <Notice tone="error">{error}</Notice>}
            {sensorId !== null ? (
              <SensorPage
                key={sensorId}
                id={sensorId}
                username={auth?.username ?? null}
                refresh={refresh}
                navigate={navigate}
              />
            ) : (
              <Dashboard
                sensors={sensors}
                now={now}
                username={auth?.username ?? null}
                refresh={refresh}
                navigate={navigate}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
