import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../api";
import type { Todo } from "../api";
import Icon from "./Icon";

export default function DeleteDialog({ todo, onDelete, onCancel }: {
  todo: Todo;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }} aria-labelledby="delete-title" aria-describedby="delete-description" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-white p-7 text-ink shadow-xl backdrop:bg-ink/30 backdrop:backdrop-blur-[3px]">
      <span className="mb-5 flex size-11 items-center justify-center rounded-xl bg-red-50 text-red-500"><Icon name="trash" className="size-5" /></span>
      <h2 id="delete-title" className="text-xl font-semibold tracking-tight">Delete this task?</h2>
      <p id="delete-description" className="mt-3 text-sm leading-6 text-muted">“<span className="break-words font-medium text-ink">{todo.title}</span>” will be permanently deleted. This can’t be undone.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <div className="mt-7 flex justify-end gap-3"><button autoFocus disabled={busy} onClick={onCancel} className="rounded-lg border border-line px-4 py-2.5 text-xs font-medium hover:bg-paper">Keep task</button><button disabled={busy} onClick={remove} className="rounded-lg bg-red-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60">{busy ? "Deleting…" : "Delete task"}</button></div>
    </dialog>
  );
}
