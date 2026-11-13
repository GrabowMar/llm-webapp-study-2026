/** Formatting helpers for durations and timestamps. */

export function durationToSeconds(duration: number | string | null | undefined): number | null {
  if (duration === null || duration === undefined || duration === "") return null;
  if (typeof duration === "number") {
    return Number.isFinite(duration) ? duration : null;
  }
  const text = duration.trim();
  if (!text) return null;
  if (text.includes(":")) {
    const parts = text.split(":").map((part) => Number(part.trim()));
    if (parts.some((part) => !Number.isFinite(part))) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) ? seconds : null;
}

export function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

export function formatDuration(duration: number | string | null | undefined): string {
  const seconds = durationToSeconds(duration);
  if (seconds === null) return "--:--";
  return formatSeconds(seconds);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
