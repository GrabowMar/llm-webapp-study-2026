export type Unit = "C" | "F";

export function formatTemp(celsius: number | null, unit: Unit): string {
  if (celsius === null) return "—";
  const value = unit === "C" ? celsius : (celsius * 9) / 5 + 32;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}°${unit}`;
}

export function formatObserved(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
