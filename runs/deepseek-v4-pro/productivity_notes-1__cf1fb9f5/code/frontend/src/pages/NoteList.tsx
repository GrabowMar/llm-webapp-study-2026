import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listNotes, listTags, type Note, type TagCount } from "../api";
import { useAuth } from "../auth";

function TagCloud({
  tags,
  active,
  onSelect,
}: {
  tags: TagCount[];
  active: string | null;
  onSelect: (tag: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {active && (
        <button
          onClick={() => onSelect(null)}
          className="rounded-full bg-slate-900 px-2 py-0.5 text-xs text-white"
        >
          {active} ✕
        </button>
      )}
      {tags.map((t) => (
        <button
          key={t.tag}
          onClick={() => onSelect(t.tag)}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            active === t.tag
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          {t.tag} <span className="text-slate-400">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

export function NoteList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { username } = useAuth();

  const tag = searchParams.get("tag") ?? null;
  const author = searchParams.get("author") ?? "";
  const q = searchParams.get("q") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const pageSize = Number(searchParams.get("page_size") ?? "10") || 10;

  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listNotes({ tag: tag ?? undefined, author: author || undefined, q: q || undefined, page, page_size: pageSize })
      .then((res) => {
        if (!alive) return;
        setNotes(res.items);
        setTotal(res.total);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tag, author, q, page, pageSize]);

  useEffect(() => {
    let alive = true;
    listTags()
      .then((res) => alive && setTags(res.items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [notes]);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notes</h1>
        {username && (
          <Link
            to="/notes/new"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            New note
          </Link>
        )}
      </div>

      <div className="mb-4 space-y-3">
        <input
          value={q}
          onChange={(e) => setParam("q", e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <input
          value={author}
          onChange={(e) => setParam("author", e.target.value)}
          placeholder="Filter by author…"
          className="w-full rounded-md border border-slate-300 px-3 py-2"
        />
        <TagCloud tags={tags} active={tag} onSelect={(t) => setParam("tag", t)} />
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-slate-500">No notes.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                to={`/notes/${note.id}`}
                className="block px-4 py-3 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  {note.pinned && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      Pinned
                    </span>
                  )}
                  <span className="font-medium">{note.title}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {note.tags.map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                  <span>by {note.author}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
