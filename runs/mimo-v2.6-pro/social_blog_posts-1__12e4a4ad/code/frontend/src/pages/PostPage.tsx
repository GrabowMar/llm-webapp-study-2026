import { useCallback, useEffect, useState } from "react";
import { api, formatDate } from "../api";
import type { Auth, Post } from "../api";
import { Link, navigate } from "../router";

function paragraphs(content: string): string[] {
  return content.split(/\n\s*\n/);
}

export default function PostPage({ auth, postId }: { auth: Auth | null; postId: number }) {
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isAdmin = auth?.username === "admin";

  const load = useCallback(() => {
    api<Post>(`/api/posts/${postId}`, { token: auth?.token ?? null })
      .then((result) => {
        setPost(result);
        setError(null);
      })
      .catch((err: unknown) => {
        setPost(null);
        setError(err instanceof Error ? err.message : "Failed to load post");
      });
  }, [postId, auth]);

  useEffect(() => {
    setPost(null);
    setError(null);
    setNotice(null);
    load();
  }, [load]);

  const isOwner = Boolean(auth && post && auth.username === post.author);

  const onDelete = async () => {
    if (!auth || !post) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE", token: auth.token });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
      setBusy(false);
    }
  };

  const onToggle = async () => {
    if (!auth || !post) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ taken_down: boolean }>(
        `/api/admin/posts/${post.id}/toggle`,
        { method: "POST", token: auth.token },
      );
      setNotice(result.taken_down ? "This post has been taken down." : "This post has been restored.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle post");
    } finally {
      setBusy(false);
    }
  };

  if (error && !post) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-medium">{error}</p>
        <Link to="/" className="mt-2 inline-block font-medium text-indigo-700 hover:underline">
          Back to all posts
        </Link>
      </div>
    );
  }

  if (!post) {
    return <p className="text-slate-600">Loading…</p>;
  }

  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        by{" "}
        <Link
          to={`/?author=${encodeURIComponent(post.author)}`}
          className="font-medium text-slate-700 hover:underline"
        >
          {post.author}
        </Link>
        {" · "}
        {formatDate(post.created_at)}
        {post.updated_at !== post.created_at && <> · updated {formatDate(post.updated_at)}</>}
      </p>

      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              to={`/?tag=${encodeURIComponent(tag)}`}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {notice && (
        <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-4 text-lg leading-relaxed text-slate-800">
        {paragraphs(post.content).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>

      {(isOwner || isAdmin) && (
        <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-200 pt-4">
          {isOwner && (
            <>
              <Link
                to={`/posts/${post.id}/edit`}
                className="rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="rounded border border-red-300 bg-red-50 px-4 py-2 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={onToggle}
              disabled={busy}
              className="rounded border border-amber-300 bg-amber-50 px-4 py-2 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Take down / restore
            </button>
          )}
        </div>
      )}
    </article>
  );
}
