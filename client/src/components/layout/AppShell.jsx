import { Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { NavLink } from './NavLink';
import { CommandPalette } from './CommandPalette';
import { ShortcutsModal } from './ShortcutsModal';
import { CreateDropModal } from './CreateDropModal';
import { ToastContainer } from '../common/Toast';
import {
  selectTheme,
  setCommandPaletteOpen,
  setCreateDropOpen,
  setShortcutsOpen,
  toggleTheme
} from '../../store/slices/uiSlice';
import { clearSession, selectCurrentUser } from '../../store/slices/authSlice';
import { useLogoutMutation } from '../../store/api/apiSlice';
import { useKeyboardShortcuts, isMac } from '../../hooks/useKeyboardShortcut';
import { initials } from '../../utils/format';

const NAV_ITEMS = [
  { to: '/', icon: '⌂', label: 'Dashboard', end: true },
  { to: '/recall', icon: '↻', label: 'Recall' },
  { to: '/explore', icon: '⌕', label: 'Explore' },
  { to: '/drops', icon: '▤', label: 'My Drops' },
  { to: '/collections', icon: '▢', label: 'Collections' }
];

/**
 * The authenticated app frame: sidebar on desktop, bottom nav on mobile
 * (spec: mobile-first), topbar with search/theme/user, and the global overlays
 * (command palette, shortcuts help, quick-create) that any page can trigger.
 */
export function AppShell() {
  const theme = useSelector(selectTheme);
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();

  useKeyboardShortcuts({
    'mod+k': () => dispatch(setCommandPaletteOpen(true)),
    'mod+n': () => dispatch(setCreateDropOpen(true)),
    r: () => navigate('/recall'),
    '?': () => dispatch(setShortcutsOpen(true))
  });

  const handleLogout = () => {
    logout()
      .unwrap()
      .catch(() => {})
      .finally(() => {
        dispatch(clearSession());
        navigate('/login');
      });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-ink-950">
      {/* Skip link — first Tab stop, invisible until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-drop-500 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <div className="mx-auto flex max-w-7xl">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 p-4 dark:border-ink-800 lg:flex">
          <Brand />

          <nav className="mt-6 flex-1 space-y-1" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} {...item} />
            ))}
          </nav>

          <button
            type="button"
            onClick={() => dispatch(setCommandPaletteOpen(true))}
            className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs text-ink-500 hover:bg-slate-100 dark:border-ink-700 dark:text-slate-500 dark:hover:bg-ink-800"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden="true">⌕</span> Quick search
            </span>
            <kbd className="rounded border border-slate-300 px-1 dark:border-ink-600">
              {isMac() ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </button>

          <UserMenu user={user} onLogout={handleLogout} />
        </aside>

        {/* Main column */}
        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/80 lg:hidden">
            <Brand compact />
            <div className="flex items-center gap-2">
              <ThemeToggle theme={theme} onToggle={() => dispatch(toggleTheme())} />
              <button
                type="button"
                onClick={() => dispatch(setCommandPaletteOpen(true))}
                aria-label="Open search"
                className="rounded-lg p-2 text-ink-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800"
              >
                ⌕
              </button>
            </div>
          </header>

          <header className="hidden items-center justify-end gap-2 border-b border-slate-200 px-6 py-3 dark:border-ink-800 lg:flex">
            <ThemeToggle theme={theme} onToggle={() => dispatch(toggleTheme())} />
            <button
              type="button"
              onClick={() => dispatch(setShortcutsOpen(true))}
              aria-label="Keyboard shortcuts"
              className="rounded-lg p-2 text-ink-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800"
            >
              ⌨
            </button>
          </header>

          <main id="main-content" className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 px-1 py-1.5 backdrop-blur dark:border-ink-800 dark:bg-ink-900/95 lg:hidden"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} {...item} compact />
        ))}
      </nav>

      {/* Floating action button — quick create (spec requirement). */}
      <button
        type="button"
        onClick={() => dispatch(setCreateDropOpen(true))}
        aria-label="Create new drop"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-drop-500 text-2xl font-light text-white shadow-glow transition-transform hover:scale-105 active:scale-95 lg:bottom-6 lg:right-6"
      >
        +
      </button>

      <CommandPalette />
      <ShortcutsModal />
      <CreateDropModal />
      <ToastContainer />
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-drop-500 font-mono text-sm font-bold text-white">
        D
      </span>
      {!compact && <span className="text-base font-semibold text-ink-900 dark:text-white">DevDrops</span>}
    </div>
  );
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800"
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function UserMenu({ user, onLogout }) {
  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-ink-700">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-drop-500/15 text-xs font-semibold text-drop-600 dark:text-drop-400">
        {initials(user.username)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink-800 dark:text-slate-200">
          {user.username}
        </p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Sign out"
        className="shrink-0 rounded-lg p-1.5 text-ink-400 hover:bg-rose-50 hover:text-rose-500 dark:text-slate-500 dark:hover:bg-rose-500/10"
      >
        ⏻
      </button>
    </div>
  );
}

export default AppShell;
