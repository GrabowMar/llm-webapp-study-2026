import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import type { Note } from "./api";
import { useAuth } from "./auth";
import { btnDanger, btnGhost, card, chip, fmtDate } from "./ui";

export default function NotePage() {
  const { id } = useParams();
  const { username } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNote(null);
    setError("");
    api<Note>(`/notes/${id}`)
      .then(setNote)
      .catch((e) => setError(e.message));
  }, [id]);

  async function remove() {
    setBusy(true);
    try {
      await api(`/notes/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
      setBusy(false);
    }
  }

  if (error && !note)
    return (
      <p role="alert" className="rounded bg-red-50 p-2 text-red-700">
        {error}
      </p>
    );
  if (!note) return <p className="text-slate-500">Loading…</p>;

  const mine = username === note.author;
  return (
    <article className={`${card} space-y-3`}>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <h1 className="break-words text-2xl font-semibold">
        {note.pinned && (
          <span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-xs font-medium text-amber-800">
            Pinned
          </span>
        )}
        {note.title}
      </h1>
      <p className="text-sm text-slate-500">
        by {note.author} · created {fmtDate(note.created_at)} · updated{" "}
        {fmtDate(note.updated_at)}
      </p>
      <div className="flex flex-wrap gap-2">
        {note.tags.map((t) => (
          <Link key={t} className={chip} to={`/?tag=${encodeURIComponent(t)}`}>
            {t}
          </Link>
        ))}
      </div>
      <div className="whitespace-pre-wrap break-words text-slate-800">{note.content}</div>
      <div className="flex gap-2 border-t border-slate-100 pt-3">
        <Link to="/" className={btnGhost}>
          Back
        </Link>
        {mine && !confirming && (
          <>
            <Link to={`/notes/${note.id}/edit`} className={btnGhost}>
              Edit
            </Link>
            <button className={btnDanger} onClick={() => setConfirming(true)}>
              Delete
            </button>
          </>
        )}
        {mine && confirming && (
          <>
            <span className="self-center text-sm text-slate-700">Delete this note?</span>
            <button className={btnDanger} disabled={busy} onClick={remove}>
              Confirm delete
            </button>
            <button className={btnGhost} disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </article>
  );
}
