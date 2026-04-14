import { create } from "zustand";

export const BOARD_COLUMN_IDS = ["queued", "active", "review", "deployed"] as const;
export type BoardColumn = (typeof BOARD_COLUMN_IDS)[number];

/** null = auto-sized (default). Number = user-set height in px. */
type CardHeights = Record<string, number | null>;

interface BoardUiState {
  collapsedCols: Partial<Record<BoardColumn, boolean>>;
  setCollapsedCols: (cols: Partial<Record<BoardColumn, boolean>>) => void;
  toggleColumn: (col: BoardColumn) => void;
  cardHeights: CardHeights;
  setCardHeight: (agentId: string, height: number | null) => void;
  reset: () => void;
}

export const useBoardUiStore = create<BoardUiState>((set) => ({
  collapsedCols: {},
  setCollapsedCols: (collapsedCols) => set({ collapsedCols }),
  toggleColumn: (col) =>
    set((s) => ({
      collapsedCols: { ...s.collapsedCols, [col]: !s.collapsedCols[col] },
    })),
  cardHeights: {},
  setCardHeight: (agentId, height) =>
    set((s) => ({
      cardHeights: { ...s.cardHeights, [agentId]: height },
    })),
  reset: () => set({ collapsedCols: {}, cardHeights: {} }),
}));
