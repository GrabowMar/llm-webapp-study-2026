import { useState } from "react";
import type { FormEvent } from "react";

interface SearchPanelProps {
  onSearch: (city: string) => void;
  busy: boolean;
}

export default function SearchPanel({ onSearch, busy }: SearchPanelProps) {
  const [city, setCity] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = city.trim();
    if (!trimmed) return;
    onSearch(trimmed);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Look up a city</h2>
      <p className="mt-1 text-sm text-slate-500">
        Every lookup is recorded so you can repeat it from your recent searches.
      </p>
      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <input
          type="text"
          name="city"
          aria-label="Search city"
          placeholder="Search a city…"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
        <button
          type="submit"
          disabled={busy || city.trim() === ""}
          className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
    </section>
  );
}
