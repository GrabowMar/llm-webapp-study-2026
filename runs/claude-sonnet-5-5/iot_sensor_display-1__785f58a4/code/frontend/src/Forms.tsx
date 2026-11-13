import { useState, type FormEvent } from "react";
import { api, type Sensor } from "./api";
import { btnCls, ErrorMsg, Field, inputCls, Panel } from "./ui";

export function NewSensorForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/sensors", { method: "POST", token, body: { name, unit, location } });
      setName("");
      setUnit("");
      setLocation("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Register a sensor">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Unit">
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C" />
        </Field>
        <Field label="Location">
          <input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <ErrorMsg message={error} />
        <button className={btnCls} disabled={busy} type="submit">
          Add sensor
        </button>
      </form>
    </Panel>
  );
}

export function NewReadingForm({
  token,
  sensors,
  fixedId,
  onDone,
}: {
  token: string;
  sensors: Sensor[];
  fixedId?: number;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<string>("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sensorId = fixedId !== undefined ? String(fixedId) : selected || String(sensors[0]?.id ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const num = Number(value);
    if (value.trim() === "" || !Number.isFinite(num)) {
      setError("Enter a valid number");
      return;
    }
    setBusy(true);
    try {
      await api(`/sensors/${sensorId}/readings`, { method: "POST", token, body: { value: num } });
      setValue("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (sensors.length === 0) {
    return (
      <Panel title="Post a reading">
        <p className="text-sm text-slate-500">Register a sensor first.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Post a reading">
      <form onSubmit={submit} className="space-y-3">
        {fixedId === undefined && (
          <Field label="Sensor">
            <select className={inputCls} value={sensorId} onChange={(e) => setSelected(e.target.value)}>
              {sensors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Value">
          <input
            className={inputCls}
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </Field>
        <ErrorMsg message={error} />
        <button className={btnCls} disabled={busy} type="submit">
          Post reading
        </button>
      </form>
    </Panel>
  );
}
