import { create } from "zustand";

export interface AppListItem {
  id: string;
  name: string;
  isAccessible: boolean;
}

interface AppListState {
  apps: AppListItem[];
  setApps: (apps: AppListItem[]) => void;
}

export const useAppListStore = create<AppListState>((set) => ({
  apps: [],
  setApps: (apps) => set({ apps }),
}));
