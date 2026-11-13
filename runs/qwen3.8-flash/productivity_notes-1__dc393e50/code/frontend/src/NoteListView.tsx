import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, flattenFieldErrors } from "./api";
import type { Note, Session, TagCount } from "./api";
import NoteEditor from "./NoteEditor";

const PAGE_SIZE = 10;

export default function NoteListView({
  session,
  onOpenNote,
  onUnauthorised,
}: {
  session: Session | null;
  onOpenNote: (id: number) => void;
  onUnauthorised: () => void;
}) {
  const [q, setQ] = useState("");
  const [author, setAuthor] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [listError, setListError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadTags = useCallback(() => {
    api
      .listTags()
      .then((r) => setTags(r.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .listNotes({})
      .then((r) => {
        if (!alive) return;
        const names = new Set(r.items.map((n) => n.author));
        setAuthors((prev) => [...new Set([...prev, ...names])].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setListError("");
    api
      .listNotes({ q: q || undefined, author: author || undefined, tag: tag || undefined, page, page_size: PAGE_SIZE })
      .then((r) => {
        if (!alive) return;
        setNotes(r.items);
        setTotal(r.total);
        const names = new Set(r.items.map((n) => n.author));
        setAuthors((prev) => {
          const merged = [...new Set([...prev, ...names])];
          return author && !merged.includes(author) ? [...merged, author] : merged.sort((a, b) => a.localeCompare(b));
        });
      })
      .catch((err) => alive && setListError(err instanceof ApiError ? err.message : "Failed to load notes."));
    return () => {
      alive = false;
    };
  }, [q, author, tag, page]);

  useEffect(loadTags, [loadTags]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  function changeFilters(next: { q?: string; author?: string; tag?: string }) {
    setPage(1);
    if ("q" in next) setQ(next.q ?? "");
    if ("author" in next) setAuthor(next.author ?? "");
    if ("tag" in next) setTag(next.tag ?? "");
  }

  async function submitCreate(value: { title: string; content: string; tags: string[]; pinned: boolean }) {
    if (!session) return ["Not signed in."];
    try {
      const note = await api.createNote(session.token, value);
      setShowCreate(false);
      changeFilters({ q: "", author: "", tag: "" });
      setPage(1);
      loadTags();
      onOpenNote(note.id);
      return [];
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) onUnauthorised();
        return [err.message, ...flattenFieldErrors(err.fieldErrors)];
      }
      return ["Network error, please try again."];
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-52 flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Search</label>
            <input
              className={input}
              placeholder="Search titles and content…"
              value={q}
              onChange={(e) => changeFilters({ q: e.target.value })}
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Author</label>
            <input
              className={input}
              list="author-options"
              placeholder="All authors"
              value={author}
              onChange={(e) => changeFilters({ author: e.target.value })}
            />
            <datalist id="author-options">
              {authors.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          {session && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              {showCreate ? "Close" : "+ New note"}
            </button>
          )}
        </div>

        {tag && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>
              Filtered by tag <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">#{tag}</span>
            </span>
            <button onClick={() => changeFilters({ tag: "" })} className="text-xs text-slate-500 underline hover:text-slate-700">
              clear
            </button>
          </div>
        )}

        {showCreate && session && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">New note</h2>
            <NoteEditor
              submitLabel="Create note"
              onSubmit={submitCreate}
              onCancel={() => setShowCreate(false)}
              initialTags={tag ? [tag] : []}
            />
          </div>
        )}

        {listError && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{listError}</p>
        )}

        {notes === null ? (
          !listError && <p className="text-sm text-slate-500">Loading notes…</p>
        ) : notes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No notes found.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onOpenNote(n.id)}
                  className={`group w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40 ${
                    n.pinned ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {n.pinned && (
                          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                            Pinned
                          </span>
                        )}
                        <h3 className="truncate text-base font-semibold text-slate-900 group-hover:text-emerald-800">
                          {n.title}
                        </h3>
                      </div>
                      <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-sm text-slate-600">
                        {n.content}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{n.author}</span>
                        <span>·</span>
                        <span>updated {new Date(n.updated_at).toLocaleString()}</span>
                        {n.tags.map((t) => (
                          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {notes && total > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Page {page} of {pages} · {total} note{total === 1 ? "" : "s"}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium transition hover:bg-slate-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Tags</h2>
          {tags.length === 0 ? (
            <p className="text-sm text-slate-500">No tags yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const active = t.tag === tag;
                const size = 12 + Math.min(10, t.count * 2);
                return (
                  <button
                    key={t.tag}
                    onClick={() => changeFilters({ tag: active ? "" : t.tag })}
                    style={{ fontSize: `${size}px` }}
                    className={`rounded-full px-2.5 py-1 transition ${
                      active
                        ? "bg-emerald-600 font-semibold text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800"
                    }`}
                  >
                    #{t.tag}
                    <span className={`ml-1 text-xs ${active ? "text-emerald-100" : "text-slate-400"}`}>{t.count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
