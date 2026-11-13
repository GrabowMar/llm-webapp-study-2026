import { useEffect, useState } from "react";

import { subscribeDrag, type DragState } from "../dnd";

export function useDragState(): DragState | null {
  const [state, setState] = useState<DragState | null>(null);
  useEffect(() => subscribeDrag(setState), []);
  return state;
}
