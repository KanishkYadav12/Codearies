import { NavLink as RouterNavLink } from 'react-router-dom';

/** Nav item shared by the desktop sidebar and the mobile bottom bar. */
export function NavLink({ to, icon, label, end = false, compact = false }) {
  return (
    <RouterNavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          compact ? 'flex-col gap-1 px-2 py-1.5 text-[11px]' : '',
          isActive
            ? 'bg-drop-500/10 text-drop-600 dark:text-drop-400'
            : 'text-ink-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-ink-800'
        ]
          .filter(Boolean)
          .join(' ')
      }
    >
      <span aria-hidden="true" className={compact ? 'text-lg' : 'text-base'}>
        {icon}
      </span>
      <span>{label}</span>
    </RouterNavLink>
  );
}

export default NavLink;
