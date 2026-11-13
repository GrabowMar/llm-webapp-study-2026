import { ApiError } from "./api";
import type { FieldErrors } from "./types";

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function errorParts(err: unknown): {
  message: string;
  errors: FieldErrors;
} {
  if (err instanceof ApiError) {
    return { message: err.message, errors: err.errors };
  }
  return { message: "Something went wrong. Please try again.", errors: {} };
}
