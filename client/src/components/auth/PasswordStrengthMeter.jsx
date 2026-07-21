import { scorePassword } from '../../utils/validators';

const BAR_COLORS = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500'];

/** Real-time password strength indicator (spec requirement, register page). */
export function PasswordStrengthMeter({ password }) {
  if (!password) {
    return null;
  }

  const { score, label, hint } = scorePassword(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              index <= score ? BAR_COLORS[score] : 'bg-slate-200 dark:bg-ink-700'
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-500 dark:text-slate-500">
        <span className="font-medium">{label}.</span> {hint}
      </p>
    </div>
  );
}

export default PasswordStrengthMeter;
