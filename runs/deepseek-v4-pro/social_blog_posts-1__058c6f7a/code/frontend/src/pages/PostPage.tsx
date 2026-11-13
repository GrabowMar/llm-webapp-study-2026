import { useEffect, useState } from "react";
import { api, formatDate, type Post } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";

export default function PostPage({ id }: { id: string }) {
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getPost(id)
      .then(setPost)
      .catch((err) =>
        setError(
          err instanceof Error && err.status === 404
            ? "Post not found"
            : err instanceof Error
              ? err.message
              : "Failed to load post",
        ),
      )
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.deletePost(id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
      setDeleting(false);
    }
  }

  async function handleToggle() {
    try {
      const updated = await api.togglePost(id);
      setPost(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update post");
    }
  }

  if (loading) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-slate-500">Loading…</p>;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
        <Link to="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          ← Back to posts
        </Link>
      </div>
    );
  }

  if (!post) return null;

  const isOwner = user?.username === post.author;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to posts
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-slate-900">{post.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        {post.author} · {formatDate(post.created_at)}
      </p>
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span
              key={t}
              className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 whitespace-pre-wrap text-slate-800">
        {post.content}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {isOwner && (
          <>
            <Link
              to={`/posts/${post.id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        )}
        {user?.is_admin && (
          <button
            onClick={handleToggle}
            className={
              post.taken_down
                ? "rounded-md border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
                : "rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50"
            }
          >
            {post.taken_down ? "Restore post" : "Take down"}
          </button>
        )}
      </div>
    </article>
  );
}
