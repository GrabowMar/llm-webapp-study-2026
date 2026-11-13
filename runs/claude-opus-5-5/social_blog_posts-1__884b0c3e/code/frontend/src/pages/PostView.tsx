import { useEffect, useState } from "react";
import { api, ApiError, type Post } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Alert, btnDanger, btnSecondary, formatDate, TagChip } from "../ui";
import TakeDownButton from "./TakeDownButton";

function paragraphs(content: string): string[] {
  return content
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim() !== "");
}

export default function PostView({ id }: { id: number }) {
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPost(null);
    setError("");
    setNotFound(false);
    api
      .getPost(id)
      .then((p) => !cancelled && setPost(p))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Failed to load post.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, user?.username]);

  const remove = async () => {
    if (!post || !window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.deletePost(post.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
      setDeleting(false);
    }
  };

  if (notFound)
    return (
      <div className="space-y-4">
        <Alert kind="info">This post doesn’t exist or is no longer available.</Alert>
        <Link href="/" className="text-indigo-600 hover:underline">
          ← Back to posts
        </Link>
      </div>
    );
  if (error && !post) return <Alert>{error}</Alert>;
  if (!post) return <p className="text-slate-500">Loading…</p>;

  const isOwner = user?.username === post.author;
  const edited = post.updated_at !== post.created_at;

  return (
    <article className="space-y-6">
      <Link href="/" className="text-sm text-indigo-600 hover:underline">
        ← Back to posts
      </Link>
      {error && <Alert>{error}</Alert>}
      {post.taken_down && <Alert kind="info">This post has been taken down and is only visible to the admin.</Alert>}
      <header className="space-y-2">
        <h1 className="break-words text-3xl font-bold text-slate-900">{post.title}</h1>
        <p className="text-sm text-slate-500">
          by{" "}
          <Link href={`/?author=${encodeURIComponent(post.author)}`} className="font-medium text-slate-700 hover:underline">
            {post.author}
          </Link>{" "}
          · <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
          {edited && (
            <>
              {" "}
              · edited <time dateTime={post.updated_at}>{formatDate(post.updated_at)}</time>
            </>
          )}
        </p>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
        )}
      </header>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 text-slate-800 shadow-sm">
        {paragraphs(post.content).map((p, i) => (
          <p key={i} className="whitespace-pre-wrap break-words leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      {(isOwner || user?.is_admin) && (
        <div className="flex flex-wrap gap-3">
          {isOwner && (
            <>
              <Link href={`/posts/${post.id}/edit`} className={btnSecondary}>
                Edit
              </Link>
              <button type="button" className={btnDanger} onClick={remove} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </>
          )}
          {user?.is_admin && <TakeDownButton post={post} onDone={(p) => setPost({ ...post, ...p })} />}
        </div>
      )}
    </article>
  );
}
