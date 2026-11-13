import assert from "node:assert/strict";
import { computeDropTarget } from "../src/lib/drop.ts";
import type { DropCard } from "../src/lib/drop.ts";

const card = (id: number, position: number, top: number): DropCard => ({
  id,
  position,
  top,
  height: 100,
});

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepEqual(actual, expected);
    console.log(`[ok ] ${label}`);
  } catch {
    failures += 1;
    console.log(`[FAIL] ${label} -> got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// Column todo: A(1) at y 0, B(2) at y 100, C(3) at y 200.
const A = card(1, 1, 0);
const B = card(2, 2, 100);
const C = card(3, 3, 200);

// Drag B (position 2) to the top of the column.
check(
  "drag to top",
  computeDropTarget({
    taskId: 2,
    fromStatus: "todo",
    fromPosition: 2,
    status: "todo",
    cards: [A, C],
    pointerY: 10,
  }),
  { index: 0, position: 1 },
);

// Drag B to the bottom of the column.
check(
  "drag to bottom",
  computeDropTarget({
    taskId: 2,
    fromStatus: "todo",
    fromPosition: 2,
    status: "todo",
    cards: [A, C],
    pointerY: 290,
  }),
  { index: 2, position: 3 },
);

// Drag C between A and B.
check(
  "drag between cards",
  computeDropTarget({
    taskId: 3,
    fromStatus: "todo",
    fromPosition: 3,
    status: "todo",
    cards: [A, B],
    pointerY: 120,
  }),
  { index: 1, position: 2 },
);

// Drag C to the top.
check(
  "drag to very top",
  computeDropTarget({
    taskId: 3,
    fromStatus: "todo",
    fromPosition: 3,
    status: "todo",
    cards: [A, B],
    pointerY: 10,
  }),
  { index: 0, position: 1 },
);

// Drag A to the bottom.
check(
  "drag first card to bottom",
  computeDropTarget({
    taskId: 1,
    fromStatus: "todo",
    fromPosition: 1,
    status: "todo",
    cards: [B, C],
    pointerY: 290,
  }),
  { index: 2, position: 3 },
);

// Drag A between B and C.
check(
  "drag first card down one slot",
  computeDropTarget({
    taskId: 1,
    fromStatus: "todo",
    fromPosition: 1,
    status: "todo",
    cards: [B, C],
    pointerY: 210,
  }),
  { index: 1, position: 2 },
);

// Dropping B on its own slot keeps the position.
check(
  "drop on own slot",
  computeDropTarget({
    taskId: 2,
    fromStatus: "todo",
    fromPosition: 2,
    status: "todo",
    cards: [A, C],
    pointerY: 110,
  }),
  { index: 1, position: 2 },
);

// Dragging from another column inserts before the card under the pointer.
check(
  "drag in between from other column",
  computeDropTarget({
    taskId: 9,
    fromStatus: "in_progress",
    fromPosition: 1,
    status: "todo",
    cards: [A, B, C],
    pointerY: 120,
  }),
  { index: 1, position: 2 },
);

// Dragging from another column to the end appends.
check(
  "drag to end from other column",
  computeDropTarget({
    taskId: 9,
    fromStatus: "in_progress",
    fromPosition: 1,
    status: "todo",
    cards: [A, B, C],
    pointerY: 290,
  }),
  { index: 3, position: 4 },
);

// Dragging from another column to the top.
check(
  "drag to top from other column",
  computeDropTarget({
    taskId: 9,
    fromStatus: "in_progress",
    fromPosition: 1,
    status: "todo",
    cards: [A, B, C],
    pointerY: 5,
  }),
  { index: 0, position: 1 },
);

// Empty target column.
check(
  "drag into empty column",
  computeDropTarget({
    taskId: 9,
    fromStatus: "in_progress",
    fromPosition: 1,
    status: "done",
    cards: [],
    pointerY: 100,
  }),
  { index: 0, position: 1 },
);

// Filtered view: only the visible cards take part, hidden cards keep their slots.
check(
  "drag with filtered column",
  computeDropTarget({
    taskId: 2,
    fromStatus: "todo",
    fromPosition: 5,
    status: "todo",
    cards: [card(1, 1, 0)],
    pointerY: 290,
  }),
  { index: 1, position: 2 },
);

console.log(failures === 0 ? "all drop calculations ok" : `${failures} failures`);
process.exit(failures === 0 ? 0 : 1);
