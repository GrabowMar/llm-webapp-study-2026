import { useState, type KeyboardEvent } from "react";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  id?: string;
};

export function TagInput({ tags, onChange, id }: Props) {
  const [draft, setDraft] = useState("");

  function addTag(raw: string) {
    const name = raw.trim().replace(/^#/, "").toLowerCase();
    if (!name) return;
    if (tags.includes(name)) {
      setDraft("");
      return;
    }
    onChange([...tags, name]);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-2 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
          >
            #{tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              aria-label={`Remove tag ${tag}`}
              className="text-indigo-400 transition hover:text-indigo-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={tags.length === 0 ? "Add a tag and press Enter" : "Add another…"}
          className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Press Enter or comma to add a tag. Tags are stored in lowercase.
      </p>
    </div>
  );
}
