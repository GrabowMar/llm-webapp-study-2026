import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  Post,
  deletePost,
  fetchPost,
  togglePost,
} from "../api";
import { formatDate } from "../format";
import { navigate } from "../router";

type Props = {
  id: number;
  username: string | null;
  onTagClick: (tag: string) => void;
};

export default function PostPage({ id, username, onTagClick }: Props) {
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchPost(id)
      .then((result) => {
        setPost(result);
        setError("");
      })
      .catch((err: unknown) => {
        setPost(null);
        setError(err instanceof ApiError ? err.message : "Failed to load post");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await deletePost(id);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to delete post");
    }
  }

  async function handleToggle() {
    try {
      await togglePost(id);
      load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Failed to update post");
    }
  }

  if (loading && !post) {
    return <p className="text-gray-500">Loading post…</p>;
  }

  if (!post) {
    return (
      <div>
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || "Post not found"}
        </div>
        <a href="#/" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Back to posts
        </a>
      </div>
    );
  }

  const isAuthor = username !== null && username === post.author;
  const isAdmin = username === "admin";

  return (
    <article>
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{post.title}</h1>
          <p className="mt-2 text-sm text-gray-500">
            by <span className="font-medium text-gray-700">{post.author}</span> ·{" "}
            <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
            {post.updated_at !== post.created_at && (
              <>
                {" "}
                · updated <time dateTime={post.updated_at}>{formatDate(post.updated_at)}</time>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAuthor && (
            <>
              <a
                href={`#/edit/${post.id}`}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit
              </a>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleToggle}
              className={
                post.taken_down
                  ? "rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                  : "rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
              }
            >
              {post.taken_down ? "Restore" : "Take down"}
            </button>
          )}
        </div>
      </div>

      {post.taken_down && (
        <span className="mb-4 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold uppercase text-red-700">
          Taken down
        </span>
      )}

      {post.tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="whitespace-pre-line leading-7 text-gray-800">{post.content}</div>
      </div>

      <div className="mt-6">
        <a href="#/" className="text-sm font-medium text-indigo-600 hover:underline">
          ← Back to posts
        </a>
      </div>
    </article>
  );
}
