import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, api, type Post } from "../api";
import { useAuth } from "../auth";
import { Button, ErrorBox, TagList, fmtDate } from "../ui";

export default function PostPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    setPost(null);
    setError("");
    api
      .getPost(id!)
      .then((p) => live && setPost(p))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : "Failed to load post"));
    return () => {
      live = false;
    };
  }, [id, user?.username]);

  async function remove() {
    try {
      await api.deletePost(post!.id);
      navigate("/");
    } catch (e) {
      setConfirming(false);
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function toggle() {
    try {
      setPost(await api.toggle(post!.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  if (error && !post) return <ErrorBox>{error}</ErrorBox>;
  if (!post) return <p className="text-slate-500">Loading…</p>;

  const paragraphs = post.content.split(/\n\s*\n/).filter((p) => p.trim());
  const own = user?.username === post.author;

  return (
    <article className="space-y-4 rounded bg-white p-6 shadow-sm">
      {error && <ErrorBox>{error}</ErrorBox>}
      {post.taken_down && <ErrorBox>This post is taken down and hidden from everyone else.</ErrorBox>}
      <header className="space-y-1">
        <h1 className="break-words text-2xl font-bold">{post.title}</h1>
        <p className="text-sm text-slate-500">
          <Link to={`/?author=${encodeURIComponent(post.author)}`} className="font-medium hover:underline">
            {post.author}
          </Link>{" "}
          · <time dateTime={post.created_at}>{fmtDate(post.created_at)}</time>
          {post.updated_at !== post.created_at && <> · updated {fmtDate(post.updated_at)}</>}
        </p>
        <TagList tags={post.tags} />
      </header>
      <div className="space-y-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line break-words">
            {p}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        {own && (
          <>
            <Link
              to={`/posts/${post.id}/edit`}
              className="rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Edit
            </Link>
            {confirming ? (
              <>
                <span className="text-sm">Delete this post?</span>
                <Button variant="danger" onClick={remove}>
                  Confirm delete
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirming(true)}>
                Delete
              </Button>
            )}
          </>
        )}
        {user?.is_admin && (
          <Button variant="danger" onClick={toggle}>
            {post.taken_down ? "Restore" : "Take down"}
          </Button>
        )}
      </div>
    </article>
  );
}
