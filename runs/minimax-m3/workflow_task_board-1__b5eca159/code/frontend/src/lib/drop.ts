import type { Status } from "../types";

export interface DropCard {
  id: number;
  position: number;
  top: number;
  height: number;
}

export interface DropComputation {
  /** Insertion index inside the visible cards of the column, the dragged card excluded. */
  index: number;
  /** Final 1-based position inside the column. */
  position: number;
}

/**
 * Work out where a dragged card lands.
 *
 * `cards` are the visible cards of the target column (the dragged card excluded) with their
 * geometry. The card is inserted before the first card whose middle lies below the pointer,
 * or after the last visible card when the pointer is below all of them.
 */
export function computeDropTarget(input: {
  taskId: number;
  fromStatus: Status;
  fromPosition: number;
  status: Status;
  cards: DropCard[];
  pointerY: number;
}): DropComputation {
  const { fromStatus, fromPosition, status, cards, pointerY } = input;

  let index = cards.length;
  let anchor: DropCard | null = null;
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (pointerY < card.top + card.height / 2) {
      anchor = card;
      index = i;
      break;
    }
  }

  const adjust = (card: DropCard) =>
    status === fromStatus && card.position > fromPosition ? card.position - 1 : card.position;

  let position: number;
  if (anchor) {
    position = adjust(anchor);
  } else if (cards.length > 0) {
    position = adjust(cards[cards.length - 1]) + 1;
  } else {
    position = 1;
  }

  return { index, position };
}
