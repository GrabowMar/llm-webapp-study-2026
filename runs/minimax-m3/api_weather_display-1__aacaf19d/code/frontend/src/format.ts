import type { Unit } from "./types";

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function convertTemperature(celsius: number | null, unit: Unit): number | null {
  if (celsius === null || celsius === undefined || Number.isNaN(celsius)) {
    return null;
  }
  return unit === "F" ? celsiusToFahrenheit(celsius) : celsius;
}

export function formatTemperature(celsius: number | null, unit: Unit): string {
  const value = convertTemperature(celsius, unit);
  if (value === null) {
    return "—";
  }
  return `${value.toFixed(1)}°${unit}`;
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
