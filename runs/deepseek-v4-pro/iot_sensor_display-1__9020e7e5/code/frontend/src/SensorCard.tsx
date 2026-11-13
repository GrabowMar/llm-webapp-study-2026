import { Link } from "react-router-dom";
import { timeAgo, type Sensor } from "./api";
import { useAuth } from "./auth";

export function SensorCard({
  sensor,
  onDeleted,
}: {
  sensor: Sensor;
  onDeleted: () => void;
}) {
  const { token, username } = useAuth();
  const mine = sensor.owner === username;

  async function remove() {
    if (!window.confirm(`Delete sensor "${sensor.name}" and all its readings?`)) {
      return;
    }
    try {
      await apiDelete(sensor.id);
      onDeleted();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function apiDelete(id: number) {
    const res = await fetch(`/api/sensors/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? "Delete failed");
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <Link
          to={`/sensors/${sensor.id}`}
          className="text-base font-semibold text-slate-900 hover:text-indigo-600"
        >
          {sensor.name}
        </Link>
        {mine && (
          <button
            onClick={remove}
            className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
      <div className="mt-1 text-sm text-slate-500">
        {[sensor.unit, sensor.location, sensor.owner].filter(Boolean).join(" · ")}
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-3xl font-semibold text-slate-900">
            {sensor.last_value === null
              ? "—"
              : `${sensor.last_value}${sensor.unit ? ` ${sensor.unit}` : ""}`}
          </div>
          <div className="text-xs text-slate-500">
            updated {timeAgo(sensor.last_updated)}
          </div>
        </div>
      </div>
    </div>
  );
}
