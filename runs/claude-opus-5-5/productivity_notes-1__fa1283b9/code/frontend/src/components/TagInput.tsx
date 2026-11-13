import { useState, type KeyboardEvent } from "react";
import { inputCls } from "./ui";

type Props = {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  invalid?: boolean;
  describedBy?: string;
};

function clean(raw: string) {
  return raw.replace(/^#+/, "").split(/\s+/).filter(Boolean).join(" ");
}

export default function TagInput({ id, value, onChange, suggestions = [], invalid, describedBy }: Props) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw.split(",").map(clean).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange(next);
    setDraft("");
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length) {
      remove(value[value.length - 1]);
    }
  };

  const listId = `${id}-suggestions`;
  const available = suggestions.filter((s) => !value.includes(s));

  return (
    <div>
      <div
        className={`flex flex-wrap items-center gap-1.5 rounded-md border bg-white px-2 py-1.5 shadow-sm focus-within:ring-2 ${
          invalid ? "border-red-400 focus-within:ring-red-200" : "border-slate-300 focus-within:border-indigo-500 focus-within:ring-indigo-200"
        }`}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700"
          >
            #{tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="rounded-full px-1 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-800"
              aria-label={`Remove tag ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          list={available.length ? listId : undefined}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={value.length ? "Add another tag" : "Type a tag and press Enter"}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${inputCls} min-w-[10rem] flex-1 border-0 px-1 py-1 shadow-none focus:ring-0`}
        />
      </div>
      {available.length > 0 && (
        <datalist id={listId}>
          {available.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      <p className="mt-1 text-xs text-slate-500">Press Enter or comma to add a tag.</p>
    </div>
  );
}
