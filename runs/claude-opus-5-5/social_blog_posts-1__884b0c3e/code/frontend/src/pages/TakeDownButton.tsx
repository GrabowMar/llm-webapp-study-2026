import { useState } from "react";
import { api, ApiError, type Post } from "../api";
import { btnWarn } from "../ui";

export default function TakeDownButton({ post, onDone }: { post: Post; onDone: (p: Post) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (!post.taken_down && !window.confirm(`Take down “${post.title}”?`)) return;
    setBusy(true);
    try {
      onDone(await api.togglePost(post.id));
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={`${btnWarn} shrink-0`} onClick={toggle} disabled={busy}>
      {post.taken_down ? "Restore" : "Take down"}
    </button>
  );
}
