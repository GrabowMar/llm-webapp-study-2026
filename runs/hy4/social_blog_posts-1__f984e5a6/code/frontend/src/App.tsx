import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  createPost,
  deletePost,
  getPost,
  listPosts,
  loadSession,
  login,
  register,
  saveSession,
  setActiveToken,
  togglePost,
  updatePost,
} from "./api";
import { Button, ErrorMessages, fieldError, formatDate, Input, Loading, Tag } from "./ui";
import { ApiError } from "./types";
import type { Post, PostList, Session } from "./types";

type Route = { name: "home" } | { name: "post"; id: number } | { name: "new" } | { name: "edit"; id: number };

function parseRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "");
  const postMatch = path.match(/^\/posts\/(\d+)$/);
  if (postMatch) return { name: "post", id: Number(postMatch[1]) };
  const editMatch = path.match(/^\/posts\/(\d+)\/edit$/);
  if (editMatch) return { name: "edit", id: Number(editMatch[1]) };
  if (path === "/new") return { name: "new" };
  return { name: "home" };
}

function navigate(path: string): void {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseRoute);
  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return route;
}

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError ? error : new ApiError(0, { message: String(error) });

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setActiveToken(session?.token ?? null);
  }, [session]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  function handleSession(next: Session | null) {
    setSession(next);
    if (next) saveSession(next);
    else clearSession();
    setActiveToken(next?.token ?? null);
    refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header session={session} onSession={handleSession} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {route.name === "home" && (
          <PostListPage key={refreshKey} session={session} onChanged={refresh} />
        )}
        {route.name === "post" && (
          <PostPage key={`${route.id}-${refreshKey}`} id={route.id} session={session} onChanged={refresh} />
        )}
        {route.name === "new" && <EditorPage session={session} onChanged={refresh} />}
        {route.name === "edit" && (
          <EditorPage key={route.id} id={route.id} session={session} onChanged={refresh} />
        )}
      </main>
      <footer className="mx-auto max-w-4xl px-4 py-8 text-center text-xs text-slate-400">
        Inkwell · a multi-author blog
      </footer>
    </div>
  );
}

function Header({ session, onSession }: { session: Session | null; onSession: (s: Session | null) => void }) {
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <button
          onClick={() => navigate("/")}
          className="text-xl font-bold tracking-tight text-indigo-700 hover:text-indigo-900"
        >
          Inkwell
        </button>
        <div className="flex items-center gap-2">
          {session ? (
            <>
              {session.isAdmin && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Admin
                </span>
              )}
              <span className="text-sm text-slate-600">
                Signed in as <strong className="text-slate-900">{session.username}</strong>
              </span>
              <Button variant="secondary" onClick={() => onSession(null)}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => { setMode("login"); setShowAuth(true); }}>
                Sign in
              </Button>
              <Button onClick={() => { setMode("register"); setShowAuth(true); }}>
                Register
              </Button>
            </>
          )}
        </div>
      </div>
      {!session && showAuth && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-6">
          <div className="mx-auto max-w-sm">
            <div className="mb-4 flex gap-2">
              <Button
                variant={mode === "login" ? "primary" : "secondary"}
                onClick={() => setMode("login")}
              >
                Sign in
              </Button>
              <Button
                variant={mode === "register" ? "primary" : "secondary"}
                onClick={() => setMode("register")}
              >
                Register
              </Button>
            </div>
            <AuthForm
              mode={mode}
              onSuccess={(next) => { onSession(next); setShowAuth(false); }}
            />
          </div>
        </div>
      )}
    </header>
  );
}

function AuthForm({ mode, onSuccess }: { mode: "login" | "register"; onSuccess: (s: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = mode === "login" ? await login(username, password) : await register(username, password);
      onSuccess(next);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        {mode === "login" ? "Sign in to your account" : "Create an account"}
      </h2>
      <Input
        label="Username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        required
      />
      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
      />
      <ErrorMessages error={error} />
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Register"}
      </Button>
      {mode === "login" && (
        <p className="text-center text-xs text-slate-500">Admin sign-in is enabled when configured on the server.</p>
      )}
    </form>
  );
}

const PAGE_SIZE = 5;

function PostListPage({ session, onChanged }: { session: Session | null; onChanged: () => void }) {
  const [data, setData] = useState<PostList | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [author, setAuthor] = useState("");
  const [page, setPage] = useState(1);
  const [showHidden, setShowHidden] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const includeHidden = showHidden && !!session?.isAdmin;

  const load = useCallback(() => {
    setError(null);
    listPosts({ q, tag, author, page, page_size: PAGE_SIZE, include_hidden: includeHidden })
      .then(setData)
      .catch((caught) => setError(toApiError(caught)));
  }, [q, tag, author, page, includeHidden]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const authors = useMemo(() => {
    const set = new Set<string>();
    for (const post of (data?.items ?? [])) set.add(post.author);
    return Array.from(set).sort();
  }, [data]);

  async function handleToggle(post: Post) {
    setBusyId(post.id);
    setError(null);
    try {
      await togglePost(post.id);
      load();
      onChanged();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Latest posts</h1>
          <p className="text-sm text-slate-500">Stories from every author, newest first.</p>
        </div>
        {session && (
          <Button onClick={() => navigate("/new")}>Write a post</Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Search"
            placeholder="Search titles and content…"
            value={q}
            onChange={(event) => { setQ(event.target.value); setPage(1); }}
          />
          <Input
            label="Tag"
            placeholder="Filter by tag…"
            value={tag}
            onChange={(event) => { setTag(event.target.value); setPage(1); }}
          />
          <Input
            label="Author"
            placeholder="Filter by author…"
            value={author}
            list="author-options"
            onChange={(event) => { setAuthor(event.target.value); setPage(1); }}
          />
          <datalist id="author-options">
            {authors.map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>
        {session?.isAdmin && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => { setShowHidden(event.target.checked); setPage(1); }}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
            />
            Show taken-down posts (admin)
          </label>
        )}
      </div>

      <ErrorMessages error={error} />

      {!data && !error ? (
        <Loading />
      ) : (
        <>
          {data && data.total === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              No posts found. Try adjusting your filters.
            </div>
          )}
          <div className="space-y-4">
            {data?.items.map((post) => (
              <article
                key={post.id}
                className={`rounded-xl border bg-white p-5 shadow-sm ${post.taken_down ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {post.taken_down && (
                      <span className="mb-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Taken down
                      </span>
                    )}
                    <button
                      onClick={() => navigate(`/posts/${post.id}`)}
                      className="block text-left text-lg font-semibold text-slate-900 hover:text-indigo-700"
                    >
                      {post.title}
                    </button>
                    <p className="mt-0.5 text-xs text-slate-500">
                      by <span className="font-medium text-slate-700">{post.author}</span> · {formatDate(post.created_at)}
                    </p>
                  </div>
                  {session?.isAdmin && (
                    <Button
                      variant={post.taken_down ? "secondary" : "danger"}
                      disabled={busyId === post.id}
                      onClick={() => handleToggle(post)}
                    >
                      {busyId === post.id ? "Working…" : post.taken_down ? "Restore" : "Take down"}
                    </Button>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>
                {post.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.tags.map((item) => (
                      <Tag key={item} onClick={() => { setTag(item); setPage(1); }}>{item}</Tag>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages} · {data?.total ?? 0} posts
              </span>
              <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PostPage({ id, session, onChanged }: { id: number; session: Session | null; onChanged: () => void }) {
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPost(id).then(setPost).catch((caught) => setError(toApiError(caught)));
  }, [id]);

  const own = !!session && !!post && session.username.toLowerCase() === post.author.toLowerCase();

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deletePost(id);
      onChanged();
      navigate("/");
    } catch (caught) {
      setError(toApiError(caught));
      setBusy(false);
    }
  }

  async function handleToggle() {
    setBusy(true);
    setError(null);
    try {
      await togglePost(id);
      onChanged();
      navigate("/");
    } catch (caught) {
      setError(toApiError(caught));
      setBusy(false);
    }
  }

  if (error && !post) {
    return (
      <div className="space-y-4">
        <ErrorMessages error={error} />
        <Button variant="secondary" onClick={() => navigate("/")}>Back to posts</Button>
      </div>
    );
  }
  if (!post) return <Loading />;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/")}>← All posts</Button>
      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {post.taken_down && (
          <span className="mb-3 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            Taken down
          </span>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{post.title}</h1>
        <p className="mt-2 text-sm text-slate-500">
          by <span className="font-medium text-slate-700">{post.author}</span> · Published {formatDate(post.created_at)}
          {post.updated_at !== post.created_at && ` · Updated ${formatDate(post.updated_at)}`}
        </p>
        {post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
          </div>
        )}
        <div className="mt-6 border-t border-slate-100 pt-6">
          <PostContent content={post.content} />
        </div>
      </article>

      <ErrorMessages error={error} />

      {(own || session?.isAdmin) && (
        <div className="flex flex-wrap items-center gap-2">
          {own && <Button variant="secondary" onClick={() => navigate(`/posts/${id}/edit`)}>Edit post</Button>}
          {own && !confirming && (
            <Button variant="danger" onClick={() => setConfirming(true)}>Delete post</Button>
          )}
          {own && confirming && (
            <>
              <span className="text-sm text-slate-600">Delete this post permanently?</span>
              <Button variant="danger" disabled={busy} onClick={handleDelete}>
                {busy ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            </>
          )}
          {session?.isAdmin && (
            <Button variant={post.taken_down ? "secondary" : "danger"} disabled={busy} onClick={handleToggle}>
              {busy ? "Working…" : post.taken_down ? "Restore post" : "Take down post"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function PostContent({ content }: { content: string }) {
  const paragraphs = content.split(/\n\s*\n/);
  return (
    <div className="space-y-4 text-base leading-7 text-slate-800">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-wrap break-words">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function EditorPage({ id, session, onChanged }: { id?: number; session: Session | null; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    getPost(id)
      .then((post) => {
        setTitle(post.title);
        setContent(post.content);
        setTags(post.tags.join(", "));
        setLoading(false);
      })
      .catch((caught) => { setError(toApiError(caught)); setLoading(false); });
  }, [id]);

  if (!session) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        Please sign in to {id ? "edit" : "write"} a post.
      </div>
    );
  }
  if (loading) return <Loading />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { title, content, tags: parseTags(tags) };
    try {
      const post = id ? await updatePost(id, payload) : await createPost(payload);
      onChanged();
      navigate(`/posts/${post.id}`);
    } catch (caught) {
      setError(toApiError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(id ? `/posts/${id}` : "/")}>← Cancel</Button>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        {id ? "Edit post" : "Write a new post"}
      </h1>
      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <Input
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A great headline"
            required
          />
          <FieldError error={error} field="title" />
        </div>
        <div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Content</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={12}
              placeholder="Write your story here. Separate paragraphs with a blank line…"
              className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600"
              required
            />
          </label>
          <p className="mt-1 text-xs text-slate-400">Plain text only. Paragraphs are kept as written.</p>
          <FieldError error={error} field="content" />
        </div>
        <div>
          <Input
            label="Tags"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="e.g. python, flask, travel"
          />
          <p className="mt-1 text-xs text-slate-400">Comma-separated. Leave empty to clear all tags.</p>
          <FieldError error={error} field="tags" />
        </div>
        <ErrorMessages error={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : id ? "Save changes" : "Publish post"}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate(id ? `/posts/${id}` : "/")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function FieldError({ error, field }: { error: ApiError | null; field: string }) {
  const message = fieldError(error, field);
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}
