/**
 * Shared constants.
 *
 * Storage keys are namespaced with `devdrops:` so the app never collides with
 * anything else served from the same origin, and so clearing our state is a
 * single prefix scan.
 */

export const TOKEN_STORAGE_KEY = 'devdrops:token';
export const THEME_STORAGE_KEY = 'devdrops:theme';
export const REMEMBER_STORAGE_KEY = 'devdrops:remember';
export const RECALL_STATE_STORAGE_KEY = 'devdrops:recall-state';
export const VIEW_MODE_STORAGE_KEY = 'devdrops:view-mode';

export const DROP_TYPES = ['code', 'command', 'link', 'note'];

export const DROP_TYPE_META = {
  code: { label: 'Code', icon: '{ }', hint: 'A snippet you want to remember' },
  command: { label: 'Command', icon: '›_', hint: 'A terminal invocation' },
  link: { label: 'Link', icon: '↗', hint: 'A reference worth keeping' },
  note: { label: 'Note', icon: '✎', hint: 'Anything else' }
};

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'recalled', label: 'Most recalled' },
  { value: 'alphabetical', label: 'A–Z' },
  { value: 'updated', label: 'Recently updated' }
];

export const COLLECTION_COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#f472b6',
  '#2dd4bf',
  '#f97316',
  '#c084fc'
];

// Spec: 8 drops per page.
export const PAGE_SIZE = 8;

export const MASTERY_THRESHOLD = 5;

/** The keyboard map, surfaced in the help sheet and the command palette. */
export const SHORTCUTS = [
  { binding: 'mod+k', label: 'Open command palette', scope: 'global' },
  { binding: 'mod+n', label: 'New drop', scope: 'global' },
  { binding: 'r', label: 'Enter recall mode', scope: 'global' },
  { binding: 'g d', label: 'Go to dashboard', scope: 'global' },
  { binding: 'escape', label: 'Close modal or overlay', scope: 'global' },
  { binding: '?', label: 'Show keyboard shortcuts', scope: 'global' },
  { binding: 'space', label: 'Reveal answer', scope: 'recall' },
  { binding: 'r', label: 'I remembered it', scope: 'recall' },
  { binding: 'n', label: 'Need to review', scope: 'recall' },
  { binding: '1–5', label: 'Rate confidence', scope: 'recall' }
];
