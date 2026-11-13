import { useState } from "react";
import type { KeyboardEvent } from "react";

export default function TagInput({
  tags,
  onChange,
  placeholder = "Add a tag and press Enter",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  const add = (raw: string) => {
    const name = raw.trim().replace(/^#/, "");
    if (!name) return;
    const exists = tags.some((tag) => tag.toLowerCase() === name.toLowerCase());
    if (!exists) {
      onChange([...tags, name]);
    }
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(value);
    } else if (event.key === "Backspace" && value === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              className="text-indigo-400 hover:text-indigo-700"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => add(value)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="min-w-[10rem] flex-1 border-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Press Enter or comma to add a tag. Tags are shown on your post.
      </p>
    </div>
  );
}
