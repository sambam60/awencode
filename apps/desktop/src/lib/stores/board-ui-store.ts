import { create } from "zustand";

export const BOARD_COLUMN_IDS = ["queued", "active", "review", "deployed"] as const;
export type BoardColumn = (typeof BOARD_COLUMN_IDS)[number];

interface BoardUiState {
  collapsedCols: Partial<Record<BoardColumn, boolean>>;
  setCollapsedCols: (cols: Partial<Record<BoardColumn, boolean>>) => void;
  toggleColumn: (col: BoardColumn) => void;
  reset: () => void;
}

export const useBoardUiStore = create<BoardUiState>((set) => ({
  collapsedCols: {},
  setCollapsedCols: (collapsedCols) => set({ collapsedCols }),
  toggleColumn: (col) =>
    set((s) => ({
      collapsedCols: { ...s.collapsedCols, [col]: !s.collapsedCols[col] },
    })),
  reset: () => set({ collapsedCols: {} }),
}));
