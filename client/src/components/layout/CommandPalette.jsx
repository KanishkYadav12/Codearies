import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import {
  selectCommandPaletteOpen,
  setCommandPaletteOpen,
  setCreateDropOpen,
  toggleTheme
} from '../../store/slices/uiSlice';
import { useDebounce } from '../../hooks/useDebounce';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import { useGetDropsQuery } from '../../store/api/apiSlice';
import { DropTypeBadge } from '../drops/DropTypeBadge';

/**
 * Custom command palette, built from scratch (frontend constraint #6).
 *
 * Two kinds of results:
 *   - **static commands** — navigation and actions, always shown, filtered by
 *     fuzzy substring match on typed text
 *   - **live drop search** — once the user has typed something, their own
 *     drops matching that text appear too, debounced so it is not a request
 *     per keystroke
 *
 * Keyboard-only operable: ↑/↓ move the selection, Enter runs it, Escape closes
 * it (handled by the parent `useKeyboardShortcut('escape', ...)` wherever this
 * is mounted — Modal-style components in this app all close on Escape).
 */

function buildCommands(navigate, dispatch) {
  return [
    { id: 'nav-dashboard', label: 'Go to Dashboard', hint: 'g d', icon: '⌂', run: () => navigate('/') },
    { id: 'nav-recall', label: 'Start Recall Mode', hint: 'r', icon: '↻', run: () => navigate('/recall') },
    { id: 'nav-explorer', label: 'Browse Explorer', icon: '⌕', run: () => navigate('/explore') },
    { id: 'nav-drops', label: 'Go to My Drops', icon: '▤', run: () => navigate('/drops') },
    { id: 'nav-collections', label: 'Go to Collections', icon: '▢', run: () => navigate('/collections') },
    { id: 'nav-profile', label: 'Go to Profile', icon: '◍', run: () => navigate('/profile') },
    {
      id: 'action-new-drop',
      label: 'Create New Drop',
      hint: 'mod+n',
      icon: '＋',
      run: () => dispatch(setCreateDropOpen(true))
    },
    {
      id: 'action-toggle-theme',
      label: 'Toggle Light / Dark Theme',
      icon: '◐',
      run: () => dispatch(toggleTheme())
    }
  ];
}

function fuzzyMatch(query, text) {
  if (!query) return true;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t.includes(q)) return true;

  // Loose subsequence match — "ddc" matches "dashboard command" style typos.
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] === q[qi]) qi += 1;
  }
  return qi === q.length;
}

export function CommandPalette() {
  const open = useSelector(selectCommandPaletteOpen);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const debouncedQuery = useDebounce(query, 200);

  const { data: searchResults } = useGetDropsQuery(
    { search: debouncedQuery, limit: 5 },
    { skip: !open || debouncedQuery.trim().length < 2 }
  );

  const commands = useMemo(() => buildCommands(navigate, dispatch), [navigate, dispatch]);

  const filteredCommands = useMemo(
    () => commands.filter((command) => fuzzyMatch(query, command.label)),
    [commands, query]
  );

  const dropResults = useMemo(
    () =>
      (searchResults?.drops || []).map((drop) => ({
        id: `drop-${drop.id}`,
        label: drop.title,
        icon: null,
        type: drop.type,
        run: () => navigate(`/drops/${drop.id}`)
      })),
    [searchResults, navigate]
  );

  const results = useMemo(
    () => [...filteredCommands, ...dropResults],
    [filteredCommands, dropResults]
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 20);
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
      };
    }
    setQuery('');
    return undefined;
  }, [open]);

  const close = () => dispatch(setCommandPaletteOpen(false));

  const runActive = () => {
    const command = results[activeIndex];
    if (command) {
      command.run();
      close();
    }
  };

  useKeyboardShortcut('escape', close, { enabled: open, allowInInputs: true });

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runActive();
    }
  };

  // Keep the highlighted row scrolled into view as the selection moves.
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const active = container.children[activeIndex];
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] sm:pt-[16vh]">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/60 backdrop-blur-sm" onClick={close} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative z-10 w-full max-w-lg animate-scale-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lifted dark:border-ink-700 dark:bg-ink-900"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-ink-700">
          <span className="text-ink-400 dark:text-slate-500" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search drops or run a command…"
            aria-label="Command palette input"
            aria-controls="command-palette-list"
            aria-activedescendant={results[activeIndex] ? `cmd-${results[activeIndex].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white dark:placeholder:text-slate-500"
          />
          <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-ink-400 dark:border-ink-600 dark:text-slate-500">
            Esc
          </kbd>
        </div>

        <ul id="command-palette-list" ref={listRef} role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-ink-400 dark:text-slate-500">
              No matches for "{query}"
            </li>
          )}

          {results.map((command, index) => (
            <li
              key={command.id}
              id={`cmd-${command.id}`}
              role="option"
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  command.run();
                  close();
                }}
                className={[
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  index === activeIndex
                    ? 'bg-drop-500/10 text-drop-600 dark:text-drop-400'
                    : 'text-ink-700 dark:text-slate-300'
                ].join(' ')}
              >
                {command.type ? (
                  <DropTypeBadge type={command.type} showLabel={false} />
                ) : (
                  <span className="w-5 text-center text-ink-400 dark:text-slate-500" aria-hidden="true">
                    {command.icon}
                  </span>
                )}
                <span className="flex-1 truncate">{command.label}</span>
                {command.hint && (
                  <kbd className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-ink-400 dark:border-ink-600 dark:text-slate-500">
                    {command.hint}
                  </kbd>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

export default CommandPalette;
