import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { computeDropTarget, type DropCard } from "./lib/drop";
import type { Status, Task } from "./types";

export interface DropTarget {
  status: Status;
  /** Insertion index inside the visible cards of the column, the dragged card excluded. */
  index: number;
  /** Final 1-based position inside the column. */
  position: number;
}

export interface DragState {
  taskId: number;
  fromStatus: Status;
  fromPosition: number;
  startX: number;
  startY: number;
  over: boolean;
  target: DropTarget | null;
}

interface Options {
  enabled: boolean;
  /** Visible cards of a column, ordered by position. */
  getVisible: (status: Status) => Task[];
  onDrop: (taskId: number, status: Status, position: number) => void;
}

const DRAG_THRESHOLD = 6;

export function useDragAndDrop({ enabled, getVisible, onDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const getVisibleRef = useRef(getVisible);
  const onDropRef = useRef(onDrop);
  getVisibleRef.current = getVisible;
  onDropRef.current = onDrop;

  const resolveDrop = useCallback((x: number, y: number, state: DragState): DropTarget | null => {
    const element = document.elementFromPoint(x, y);
    if (!element) {
      return null;
    }
    const column = (element as HTMLElement).closest("[data-column]");
    if (!column) {
      return null;
    }
    const status = column.getAttribute("data-column") as Status;
    const visible = getVisibleRef.current(status);

    const cards: DropCard[] = [];
    for (const task of visible) {
      if (task.id === state.taskId) {
        continue;
      }
      const node = document.querySelector(`[data-task-id="${task.id}"]`);
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      cards.push({ id: task.id, position: task.position, top: rect.top, height: rect.height });
    }

    const result = computeDropTarget({
      taskId: state.taskId,
      fromStatus: state.fromStatus,
      fromPosition: state.fromPosition,
      status,
      cards,
      pointerY: y,
    });

    return { status, index: result.index, position: result.position };
  }, []);

  function handleMove(event: PointerEvent) {
    const state = dragRef.current;
    if (!state) {
      return;
    }
    if (!state.over) {
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (distance < DRAG_THRESHOLD) {
        return;
      }
    }
    const target = resolveDrop(event.clientX, event.clientY, state);
    const next: DragState = { ...state, over: true, target };
    dragRef.current = next;
    setDrag(next);
  }

  function handleUp(event: PointerEvent) {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    removeListeners();
    if (!state || !state.over) {
      return;
    }
    const target = resolveDrop(event.clientX, event.clientY, state) ?? state.target;
    if (!target) {
      return;
    }
    suppressClick.current = true;
    onDropRef.current(state.taskId, target.status, target.position);
  }

  function handleCancel() {
    dragRef.current = null;
    setDrag(null);
    removeListeners();
  }

  function removeListeners() {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleCancel);
  }

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, task: Task) => {
      if (!enabled) {
        return;
      }
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      const origin = event.target as HTMLElement | null;
      if (origin?.closest("[data-no-drag]")) {
        return;
      }

      const state: DragState = {
        taskId: task.id,
        fromStatus: task.status,
        fromPosition: task.position,
        startX: event.clientX,
        startY: event.clientY,
        over: false,
        target: null,
      };
      dragRef.current = state;
      setDrag(state);

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleCancel);
    },
    [enabled],
  );

  useEffect(() => removeListeners, []);

  const consumeSuppressedClick = useCallback(() => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return true;
    }
    return false;
  }, []);

  return { drag, startDrag, consumeSuppressedClick };
}
