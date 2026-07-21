import { createSlice } from '@reduxjs/toolkit';

import {
  RECALL_STATE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY
} from '../../constants';

/**
 * UI state: theme, explorer filters, recall-session progress and overlays.
 *
 * The spec asks for the theme, the current filters and the recall queue state
 * to live in Redux, and for the theme and recall state to persist.
 *
 * Persistence is selective and deliberate:
 *   - **theme** persists, and is applied to <html> before first paint by the
 *     inline script in index.html.
 *   - **recall session** persists, so closing the tab mid-review and coming
 *     back does not lose your place in the queue.
 *   - **filters** do NOT persist. Returning to the app hours later and finding
 *     it silently filtered to "code drops tagged docker" reads as a bug.
 */

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* private mode - in-memory only */
  }
}

function preferredTheme() {
  const stored = readJson(THEME_STORAGE_KEY, null);

  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  // Fall back to the OS setting rather than assuming dark.
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch (error) {
    return 'dark';
  }
}

export const DEFAULT_FILTERS = {
  search: '',
  type: '',
  language: '',
  visibility: '',
  tag: '',
  sort: 'newest',
  favorite: false,
  due: false,
  collectionId: '',
  page: 1
};

const initialState = {
  theme: preferredTheme(),
  viewMode: readJson(VIEW_MODE_STORAGE_KEY, 'list'),

  filters: { ...DEFAULT_FILTERS },

  // Recall session progress, persisted across reloads.
  recall: readJson(RECALL_STATE_STORAGE_KEY, {
    sessionId: null,
    completedIds: [],
    revealed: false,
    startedAt: null
  }),

  // Overlays. Kept in Redux because the command palette can open any of them
  // from anywhere in the tree.
  commandPaletteOpen: false,
  shortcutsOpen: false,
  createDropOpen: false,
  mobileNavOpen: false,

  // Drop ids selected for bulk actions on the "my drops" page.
  selectedDropIds: [],

  toasts: []
};

let toastId = 0;

const uiSlice = createSlice({
  name: 'ui',
  initialState,

  reducers: {
    setTheme(state, action) {
      state.theme = action.payload;
      writeJson(THEME_STORAGE_KEY, action.payload);
    },

    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      writeJson(THEME_STORAGE_KEY, state.theme);
    },

    setViewMode(state, action) {
      state.viewMode = action.payload;
      writeJson(VIEW_MODE_STORAGE_KEY, action.payload);
    },

    /**
     * Merges filter changes and resets to page 1 — unless the change *is* a
     * page change. Forgetting this is the classic bug where applying a filter
     * leaves you on page 4 of a 1-page result and the list looks empty.
     */
    setFilters(state, action) {
      const changes = action.payload || {};
      const onlyPageChanged = Object.keys(changes).length === 1 && 'page' in changes;

      state.filters = {
        ...state.filters,
        ...changes,
        page: onlyPageChanged ? changes.page : 1
      };
    },

    resetFilters(state) {
      state.filters = { ...DEFAULT_FILTERS };
    },

    /* ---- recall session ---- */

    startRecallSession(state) {
      state.recall = {
        sessionId: `${Date.now()}`,
        completedIds: [],
        revealed: false,
        startedAt: new Date().toISOString()
      };
      writeJson(RECALL_STATE_STORAGE_KEY, state.recall);
    },

    revealDrop(state) {
      state.recall.revealed = true;
      writeJson(RECALL_STATE_STORAGE_KEY, state.recall);
    },

    completeRecall(state, action) {
      const id = action.payload;

      if (!state.recall.completedIds.includes(id)) {
        state.recall.completedIds.push(id);
      }

      // Reset the reveal for the next card.
      state.recall.revealed = false;
      writeJson(RECALL_STATE_STORAGE_KEY, state.recall);
    },

    endRecallSession(state) {
      state.recall = { sessionId: null, completedIds: [], revealed: false, startedAt: null };
      writeJson(RECALL_STATE_STORAGE_KEY, state.recall);
    },

    /* ---- overlays ---- */

    setCommandPaletteOpen(state, action) {
      state.commandPaletteOpen = action.payload;
    },

    toggleCommandPalette(state) {
      state.commandPaletteOpen = !state.commandPaletteOpen;
    },

    setShortcutsOpen(state, action) {
      state.shortcutsOpen = action.payload;
    },

    setCreateDropOpen(state, action) {
      state.createDropOpen = action.payload;
    },

    setMobileNavOpen(state, action) {
      state.mobileNavOpen = action.payload;
    },

    closeAllOverlays(state) {
      state.commandPaletteOpen = false;
      state.shortcutsOpen = false;
      state.createDropOpen = false;
      state.mobileNavOpen = false;
    },

    /* ---- bulk selection ---- */

    toggleDropSelection(state, action) {
      const id = action.payload;
      const index = state.selectedDropIds.indexOf(id);

      if (index === -1) {
        state.selectedDropIds.push(id);
      } else {
        state.selectedDropIds.splice(index, 1);
      }
    },

    selectDrops(state, action) {
      state.selectedDropIds = action.payload;
    },

    clearSelection(state) {
      state.selectedDropIds = [];
    },

    /* ---- toasts ---- */

    pushToast: {
      reducer(state, action) {
        state.toasts.push(action.payload);

        // Bound the stack; a burst of errors should not bury the screen.
        if (state.toasts.length > 4) {
          state.toasts.shift();
        }
      },
      prepare(message, tone = 'info', options = {}) {
        toastId += 1;

        return {
          payload: {
            id: `toast-${toastId}`,
            message,
            tone,
            duration: options.duration ?? (tone === 'error' ? 6000 : 3500),
            action: options.action || null
          }
        };
      }
    },

    dismissToast(state, action) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload);
    },

    clearToasts(state) {
      state.toasts = [];
    }
  }
});

export const {
  setTheme,
  toggleTheme,
  setViewMode,
  setFilters,
  resetFilters,
  startRecallSession,
  revealDrop,
  completeRecall,
  endRecallSession,
  setCommandPaletteOpen,
  toggleCommandPalette,
  setShortcutsOpen,
  setCreateDropOpen,
  setMobileNavOpen,
  closeAllOverlays,
  toggleDropSelection,
  selectDrops,
  clearSelection,
  pushToast,
  dismissToast,
  clearToasts
} = uiSlice.actions;

export const selectTheme = (state) => state.ui.theme;
export const selectViewMode = (state) => state.ui.viewMode;
export const selectFilters = (state) => state.ui.filters;
export const selectRecallSession = (state) => state.ui.recall;
export const selectToasts = (state) => state.ui.toasts;
export const selectSelectedDropIds = (state) => state.ui.selectedDropIds;
export const selectCommandPaletteOpen = (state) => state.ui.commandPaletteOpen;
export const selectShortcutsOpen = (state) => state.ui.shortcutsOpen;
export const selectCreateDropOpen = (state) => state.ui.createDropOpen;

export default uiSlice.reducer;
