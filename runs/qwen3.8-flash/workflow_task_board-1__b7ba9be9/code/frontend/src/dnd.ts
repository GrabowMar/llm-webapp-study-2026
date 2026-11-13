import type { Status } from "./api";

export interface DropTarget {
  status: Status;
  position: number;
}

export interface DragState {
  taskId: number;
  source: DropTarget;
  target: DropTarget | null;
}

type Listener = (state: DragState | null) => void;

let current: DragState | null = null;
let commit: ((target: DropTarget) => void) | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(current);
}

export function subscribeDrag(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDragState(): DragState | null {
  return current;
}

function computeTarget(x: number, y: number): DropTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const column = (element as HTMLElement).closest?.("[data-column]") as HTMLElement | null;
    if (!column) continue;
    const status = column.dataset.column as Status;
    const slots = Array.from(column.querySelectorAll<HTMLElement>("[data-slot]"));
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        return { status, position: Number(slot.dataset.slot) };
      }
    }
    return null;
  }
  return null;
}

function handlePointerMove(event: PointerEvent): void {
  if (!current) return;
  const target = computeTarget(event.clientX, event.clientY);
  const same =
    (target === null && current.target === null) ||
    (target !== null &&
      current.target !== null &&
      target.status === current.target.status &&
      target.position === current.target.position);
  if (!same) {
    current = { ...current, target };
    emit();
  }
}

function finish(): void {
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", handlePointerUp);
  window.removeEventListener("pointercancel", cancel);
  current = null;
  commit = null;
  emit();
}

function handlePointerUp(): void {
  const state = current;
  const save = commit;
  if (state && state.target && save) save(state.target);
  finish();
}

function cancel(): void {
  finish();
}

export function startDrag(
  taskId: number,
  source: DropTarget,
  onCommit: (target: DropTarget) => void
): void {
  current = { taskId, source, target: null };
  commit = onCommit;
  emit();
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", cancel);
}
