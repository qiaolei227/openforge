import { create } from 'zustand';

const STORAGE_KEY = 'openforge_menu_favorites';

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

interface FavoriteState {
  ids: Set<string>;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  ids: loadFavorites(),
  isFavorite: (id: string) => get().ids.has(id),
  toggle: (id: string) => {
    set((state) => {
      const next = new Set(state.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavorites(next);
      return { ids: next };
    });
  },
}));
