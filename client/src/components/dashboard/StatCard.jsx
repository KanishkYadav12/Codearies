import { number } from '../../utils/format';

const TONES = {
  default: 'text-ink-900 dark:text-white',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  brand: 'text-drop-600 dark:text-drop-400'
};

/** One dashboard/profile stat tile. */
export function StatCard({ label, value, icon, tone = 'default', hint }) {
  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-slate-500">
          {label}
        </span>
        {icon && (
          <span className="text-base opacity-60" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${TONES[tone]}`}>{number(value)}</p>
      {hint && <p className="mt-1 text-xs text-ink-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export default StatCard;
