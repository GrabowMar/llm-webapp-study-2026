import type { Unit } from "./types";

export function toFahrenheit(celsius: number): number {
  return celsius * 1.8 + 32;
}

function trim(value: number): string {
  const text = value.toFixed(1);
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

export function formatTemp(celsius: number | null, unit: Unit): string {
  if (celsius === null) return "—";
  return `${trim(unit === "F" ? toFahrenheit(celsius) : celsius)}°${unit}`;
}

export function formatNumber(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${trim(value)}${suffix}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
