import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import type { Post } from "../types";
import { ErrorBanner, TagPill, formatDate } from "./ui";

export function PostPage({
  postId,
  onNavigate,
}: {
  postId: number;
  onNavigate: (to: string) => void;
}) {
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setMissing(false);
    api
      .getPost(postId)
      .then((p) => {
        setPost(p);
        setError("");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setError(err instanceof Error ? err.message : "Failed to load post");
      });
  }, [postId]);

  useEffect(load, [load]);

  const toggle = async () => {
    if (!post) return;
    setBusy(true);
    try {
      setPost(await api.togglePost(post.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!post || !window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deletePost(post.id);
      onNavigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-slate-700">Post not found</p>
        <p className="mt-1 text-sm text-slate-500">
          It may have been deleted or taken down.
        </p>
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Back to posts
        </button>
      </div>
    );
  }

  if (!post) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const isAuthor = user !== null && user.username === post.author;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{post.title}</h1>
        {post.taken_down && (
          <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
            Taken down
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        by <span className="font-medium text-slate-700">{post.author}</span> ·{" "}
        {formatDate(post.created_at)}
        {post.updated_at !== post.created_at && (
          <> · updated {formatDate(post.updated_at)}</>
        )}
      </p>

      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      )}

      <div className="mt-6 text-[15px] leading-7 text-slate-700">
        {post.content.split(/\r?\n/).map((paragraph, i) =>
          paragraph.trim() ? (
            <p key={i} className="mb-4 last:mb-0">
              {paragraph}
            </p>
          ) : null,
        )}
      </div>

      {error && (
        <div className="mt-6">
          <ErrorBanner message={error} onDismiss={() => setError("")} />
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          ← Back to posts
        </button>
        {isAuthor && (
          <>
            <button
              type="button"
              onClick={() => onNavigate(`/posts/${post.id}/edit`)}
              className="rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
        {user?.is_admin && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              post.taken_down ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {post.taken_down ? "Restore post" : "Take down"}
          </button>
        )}
      </div>
    </article>
  );
}
