import { useEffect, useState } from "react";
import { ApiError, request } from "../api";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import type { Post } from "../types";
import { Alert, Button, Spinner, Tag, formatDate } from "../components/ui";

export function PostPage({ id }: { id: number }) {
  const { navigate } = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    request<Post>(`/api/posts/${id}`)
      .then((result) => {
        if (active) setPost(result);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This post does not exist or is not available."
            : err instanceof Error
              ? err.message
              : "Failed to load the post.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function remove() {
    if (!post) return;
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await request(`/api/posts/${post.id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete the post.");
    }
  }

  async function toggle() {
    if (!post) return;
    try {
      const updated = await request<Post>(`/api/admin/posts/${post.id}/toggle`, {
        method: "POST",
      });
      setPost(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    }
  }

  if (loading) return <Spinner />;
  if (!post) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Alert>{error ?? "Post not found."}</Alert>
        <Button variant="secondary" onClick={() => navigate("/")}>
          Back to posts
        </Button>
      </div>
    );
  }

  const isAuthor =
    user?.username.toLowerCase() === post.author.toLowerCase();

  return (
    <article className="mx-auto max-w-3xl">
      <button
        className="mb-4 text-sm text-slate-500 hover:text-slate-900"
        onClick={() => navigate("/")}
      >
        ← All posts
      </button>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {post.taken_down && (
        <div className="mb-4">
          <Alert kind="info">
            This post is taken down. Only the admin can see it.
          </Alert>
        </div>
      )}
      <h1 className="text-3xl font-bold leading-tight">{post.title}</h1>
      <p className="mt-2 text-sm text-slate-500">
        by <span className="font-medium text-slate-700">{post.author}</span> ·{" "}
        {formatDate(post.created_at)}
        {post.updated_at !== post.created_at && (
          <> · updated {formatDate(post.updated_at)}</>
        )}
      </p>
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}

      {(isAuthor || user?.is_admin) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isAuthor && (
            <>
              <Button
                variant="secondary"
                onClick={() => navigate(`/posts/${post.id}/edit`)}
              >
                Edit
              </Button>
              <Button variant="danger" onClick={remove}>
                Delete
              </Button>
            </>
          )}
          {user?.is_admin && (
            <Button variant={post.taken_down ? "primary" : "danger"} onClick={toggle}>
              {post.taken_down ? "Restore post" : "Take down"}
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 whitespace-pre-wrap break-words text-[1.05rem] leading-8 text-slate-800">
        {post.content}
      </div>
    </article>
  );
}
