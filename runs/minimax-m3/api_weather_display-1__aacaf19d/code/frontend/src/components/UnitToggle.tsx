import type { Unit } from "../types";

interface UnitToggleProps {
  unit: Unit;
  onChange: (unit: Unit) => void;
}

export default function UnitToggle({ unit, onChange }: UnitToggleProps) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 p-1"
      role="group"
      aria-label="Temperature unit"
    >
      {(["C", "F"] as Unit[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={unit === option}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
            unit === option
              ? "bg-sky-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          °{option}
        </button>
      ))}
    </div>
  );
}
