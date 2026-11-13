import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  clearSession,
  getToken,
  getUsername,
  saveSession,
  type Note,
  type NoteListItem,
} from "./api";

function publicPath(id: number): string {
  return `/notes/${id}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MarkdownView({ html }: { html: string }) {
  return (
    <div
      className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-indigo-600 prose-pre:bg-slate-900 prose-pre:text-slate-100"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      {label}
    </div>
  );
}

function PublishedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      Published
    </span>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
    >
      {children}
    </button>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api.register(username, password);
      }
      const { token } = await api.login(username, password);
      saveSession(token, username.trim());
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Markdown Notes
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Write in Markdown. Publish when you&apos;re ready to share.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  mode === m
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="you"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function PublicPage({ id }: { id: number }) {
  const [meta, setMeta] = useState<{
    title: string;
    author: string;
    updated_at: string;
  } | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [note, rendered] = await Promise.all([
          api.publicNote(id),
          api.publicNoteHtml(id),
        ]);
        if (!cancelled) {
          setMeta({
            title: note.title,
            author: note.author,
            updated_at: note.updated_at,
          });
          setHtml(rendered);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Note not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <a href="/" className="text-sm font-semibold text-slate-800">
            Markdown Notes
          </a>
          <span className="text-xs text-slate-400">Public note</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        {error ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <h1 className="text-lg font-semibold text-slate-800">
              Note unavailable
            </h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <a href="/" className="mt-4 inline-block text-sm text-indigo-600">
              Go home
            </a>
          </div>
        ) : !meta || html === null ? (
          <Spinner />
        ) : (
          <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {meta.title || "Untitled"}
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              by <span className="font-medium text-slate-700">{meta.author}</span>
              {" · "}
              {formatDate(meta.updated_at)}
            </p>
            <hr className="my-8 border-slate-200" />
            <MarkdownView html={html} />
          </article>
        )}
      </main>
    </div>
  );
}

type EditorState = {
  id: number | null;
  title: string;
  body: string;
  published: boolean;
  author: string;
  savedAt: string | null;
};

const emptyEditor = (): EditorState => ({
  id: null,
  title: "",
  body: "",
  published: false,
  author: "",
  savedAt: null,
});

function Editor({
  note,
  onChange,
}: {
  note: Note | null;
  onChange: () => void;
}) {
  const [state, setState] = useState<EditorState>(emptyEditor);
  const [preview, setPreview] = useState("");
  const [previewPending, setPreviewPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const changedSinceLoad = useRef(false);

  useEffect(() => {
    changedSinceLoad.current = false;
    setStatus("idle");
    setError("");
    setState(
      note
        ? {
            id: note.id,
            title: note.title,
            body: note.body,
            published: note.published,
            author: note.author,
            savedAt: note.updated_at,
          }
        : emptyEditor(),
    );
  }, [note]);

  const renderBody = useCallback(async (body: string) => {
    setPreviewPending(true);
    try {
      const html = await api.renderMarkdown(body);
      setPreview(html);
    } catch {
      setPreview('<p class="text-red-600">Preview unavailable.</p>');
    } finally {
      setPreviewPending(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void renderBody(state.body), 250);
    return () => clearTimeout(timer);
  }, [state.body, renderBody]);

  const save = useCallback(
    async (patch: Partial<Pick<EditorState, "title" | "body" | "published">>) => {
      const current = stateRef.current;
      setStatus("saving");
      setError("");
      try {
        let result: Note;
        if (current.id === null) {
          result = await api.createNote({
            title: patch.title ?? current.title,
            body: patch.body ?? current.body,
            published: patch.published ?? current.published,
          });
        } else {
          result = await api.updateNote(current.id, patch);
        }
        setState({
          id: result.id,
          title: result.title,
          body: result.body,
          published: result.published,
          author: result.author,
          savedAt: result.updated_at,
        });
        setStatus("saved");
        onChange();
        return result.id;
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Could not save");
        return null;
      }
    },
    [onChange],
  );

  const fieldChanged = (
    patch: Partial<Pick<EditorState, "title" | "body" | "published">>,
  ) => {
    setState((prev) => ({ ...prev, ...patch }));
    changedSinceLoad.current = true;
  };

  useEffect(() => {
    if (!changedSinceLoad.current) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      void save({
        title: current.title,
        body: current.body,
        published: current.published,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [state.title, state.body, state.published, save]);

  const publicLink =
    state.id !== null
      ? `${window.location.origin}${publicPath(state.id)}`
      : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <input
          value={state.title}
          onChange={(e) => fieldChanged({ title: e.target.value })}
          placeholder="Untitled note"
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-slate-900 outline-none placeholder:text-slate-300"
        />
        <div className="flex items-center gap-2 text-xs">
          {status === "saving" && <span className="text-slate-400">Saving…</span>}
          {status === "saved" && <span className="text-emerald-600">Saved</span>}
          {status === "error" && <span className="text-red-600">{error}</span>}
          {status === "idle" && state.savedAt && (
            <span className="text-slate-400">
              Updated {formatDate(state.savedAt)}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Published</span>
          <button
            type="button"
            role="switch"
            aria-checked={state.published}
            onClick={() => fieldChanged({ published: !state.published })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              state.published ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                state.published ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          {state.published && <PublishedBadge />}
        </label>
        {state.published && state.id !== null && (
          <div className="flex min-w-0 items-center gap-2">
            <a
              href={publicPath(state.id)}
              target="_blank"
              rel="noreferrer"
              className="truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-indigo-600 hover:underline"
              title={publicLink}
            >
              {publicLink}
            </a>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="flex min-h-[320px] flex-col border-r border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Markdown
          </div>
          <textarea
            value={state.body}
            onChange={(e) => fieldChanged({ body: e.target.value })}
            placeholder="Write your note in Markdown…"
            spellCheck={false}
            className="min-h-[320px] flex-1 resize-none bg-white p-5 font-mono text-sm leading-relaxed text-slate-800 outline-none placeholder:text-slate-300"
          />
        </div>
        <div className="flex min-h-[320px] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            <span>Preview</span>
            {previewPending && <span className="text-indigo-500">rendering…</span>}
          </div>
          <div className="min-h-[320px] flex-1 overflow-auto bg-white p-5">
            {state.body.trim() ? (
              <MarkdownView html={preview} />
            ) : (
              <p className="text-sm italic text-slate-300">
                Nothing to preview yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [items, setItems] = useState<NoteListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteError, setNoteError] = useState("");

  const refreshList = useCallback(async () => {
    try {
      const { items: next } = await api.listNotes();
      setItems(next);
      setListError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSignOut();
        return;
      }
      setListError(err instanceof Error ? err.message : "Could not load notes");
    } finally {
      setListLoading(false);
    }
  }, [onSignOut]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const loadNote = useCallback(
    async (id: number) => {
      setNoteLoading(true);
      setNoteError("");
      try {
        setNote(await api.getNote(id));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          onSignOut();
          return;
        }
        setNoteError(err instanceof Error ? err.message : "Could not open note");
        setNote(null);
      } finally {
        setNoteLoading(false);
      }
    },
    [onSignOut],
  );

  useEffect(() => {
    if (selectedId === "new") {
      setNote(null);
      setNoteError("");
    } else if (selectedId !== null) {
      void loadNote(selectedId);
    }
  }, [selectedId, loadNote]);

  const selectNote = (id: number | "new") => {
    setSelectedId(id);
  };

  const createNew = () => {
    setNote(null);
    setNoteError("");
    setSelectedId("new");
    void refreshList();
  };

  const removeNote = async (id: number) => {
    if (!window.confirm("Delete this note permanently?")) return;
    try {
      await api.deleteNote(id);
      if (selectedId === id) {
        setSelectedId(null);
        setNote(null);
      }
      await refreshList();
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Could not delete");
    }
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    onSignOut();
  };

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-slate-900">
            Markdown Notes
          </span>
          <span className="hidden text-xs text-slate-400 sm:inline">
            / {getUsername()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">
            Signed in as{" "}
            <span className="font-medium text-slate-900">{getUsername()}</span>
          </span>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-full shrink-0 flex-col border-r border-slate-200 bg-white sm:w-72">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-700">Your notes</h2>
            <button
              type="button"
              onClick={createNew}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              + New
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {listLoading ? (
              <div className="p-4">
                <Spinner />
              </div>
            ) : listError ? (
              <p className="p-4 text-sm text-red-600">{listError}</p>
            ) : items.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-slate-500">No notes yet.</p>
                <button
                  type="button"
                  onClick={createNew}
                  className="mt-2 text-sm text-indigo-600 hover:underline"
                >
                  Create your first note
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className={`group flex items-start gap-2 px-4 py-3 transition ${
                      selectedId === item.id
                        ? "bg-indigo-50"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectNote(item.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">
                          {item.title || "Untitled"}
                        </span>
                        {item.published && <PublishedBadge />}
                      </div>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {formatDate(item.updated_at)}
                      </span>
                    </button>
                    <IconButton
                      label="Delete note"
                      onClick={() => void removeNote(item.id)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        className="h-4 w-4"
                      >
                        <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                      </svg>
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden bg-white">
          {selectedId === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-indigo-50 p-4 text-2xl">✎</div>
              <p className="text-sm text-slate-500">
                Select a note or create a new one.
              </p>
              <button
                type="button"
                onClick={createNew}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                New note
              </button>
            </div>
          ) : noteLoading ? (
            <div className="p-8">
              <Spinner />
            </div>
          ) : noteError ? (
            <div className="p-8 text-sm text-red-600">{noteError}</div>
          ) : (
            <Editor note={note} onChange={() => void refreshList()} />
          )}
        </main>
      </div>
    </div>
  );
}

function currentPublicId(): number | null {
  const match = window.location.pathname.match(/^\/notes\/(\d+)\/?$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default function App() {
  const [signedIn, setSignedIn] = useState(() => Boolean(getToken()));
  const publicId = currentPublicId();

  useEffect(() => {
    const onPopState = () => window.location.reload();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (publicId !== null) return <PublicPage id={publicId} />;

  if (!signedIn)
    return <AuthScreen onSignedIn={() => setSignedIn(true)} />;

  return (
    <Workspace
      onSignOut={() => {
        clearSession();
        setSignedIn(false);
      }}
    />
  );
}
