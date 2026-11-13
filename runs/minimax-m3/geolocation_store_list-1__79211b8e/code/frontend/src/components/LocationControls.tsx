import type { Coords } from "../types";

type LocationControlsProps = {
  coords: Coords | null;
  radius: number;
  locating: boolean;
  onLocate: () => void;
  onRadiusChange: (radius: number) => void;
  onClear: () => void;
};

const RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50, 100];

export default function LocationControls({
  coords,
  radius,
  locating,
  onLocate,
  onRadiusChange,
  onClear,
}: LocationControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <button
        type="button"
        onClick={onLocate}
        disabled={locating}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M10 2a6 6 0 0 0-6 6c0 4.2 5.1 9.4 5.32 9.62a.99.99 0 0 0 1.36 0C10.9 17.4 16 12.2 16 8a6 6 0 0 0-6-6Zm0 8.25A2.25 2.25 0 1 1 10 5.75a2.25 2.25 0 0 1 0 4.5Z" />
        </svg>
        {locating ? "Locating…" : "Use my location"}
      </button>

      <label className="block text-sm">
        <span className="font-medium text-slate-700">Radius</span>
        <select
          value={radius}
          disabled={!coords}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
          className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        >
          {RADIUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} km
            </option>
          ))}
        </select>
      </label>

      {coords && (
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
            {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Clear location
          </button>
        </div>
      )}
    </div>
  );
}
