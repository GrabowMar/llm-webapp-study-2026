import { useState, type FormEvent } from "react";
import { api, type Sensor } from "./api";
import { Button, ErrorMessage, Field, errorText } from "./ui";

export function NewSensorForm({ onCreated }: { onCreated: (s: Sensor) => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await api.createSensor({ name: name.trim(), unit: unit.trim(), location: location.trim() });
      setName("");
      setUnit("");
      setLocation("");
      onCreated(s);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Register a sensor</h2>
      <Field label="Name" name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Living room temperature" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°C" />
        <Field label="Location" name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Living room" />
      </div>
      <ErrorMessage message={error} />
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add sensor"}
      </Button>
    </form>
  );
}

export function ReadingForm({
  sensors,
  fixedSensorId,
  onPosted,
}: {
  sensors: Sensor[];
  fixedSensorId?: number;
  onPosted: () => void;
}) {
  const [sensorId, setSensorId] = useState<string>("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = fixedSensorId ?? (sensorId ? Number(sensorId) : sensors[0]?.id);
  const selectedSensor = sensors.find((s) => s.id === selected);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const num = Number(value);
    if (value.trim() === "" || !Number.isFinite(num)) {
      setError("Enter a numeric value");
      return;
    }
    if (!selected) {
      setError("Choose a sensor");
      return;
    }
    setBusy(true);
    try {
      await api.postReading(selected, num);
      setValue("");
      setSuccess(`Recorded ${num}${selectedSensor?.unit ? ` ${selectedSensor.unit}` : ""}`);
      onPosted();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (sensors.length === 0 && fixedSensorId === undefined) {
    return (
      <div>
        <h2 className="text-base font-semibold text-slate-900">Post a reading</h2>
        <p className="mt-2 text-sm text-slate-500">Register a sensor first to post readings.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Post a reading</h2>
      {fixedSensorId === undefined && (
        <label className="block">
          <span className="block text-sm font-medium text-slate-700">Sensor</span>
          <select
            name="sensor"
            value={selected ?? ""}
            onChange={(e) => setSensorId(e.target.value)}
            className="mt-1 block w-full rounded-md border-0 px-3 py-2 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
          >
            {sensors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.location ? ` (${s.location})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <Field
        label={`Value${selectedSensor?.unit ? ` (${selectedSensor.unit})` : ""}`}
        name="value"
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
      />
      <ErrorMessage message={error} />
      {success && <p className="text-sm text-emerald-700">{success}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? "Posting…" : "Post reading"}
      </Button>
    </form>
  );
}
