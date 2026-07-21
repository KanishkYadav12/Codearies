import { useId } from 'react';

/** Custom-styled checkbox built on a real, accessible `<input type="checkbox">`. */
export function Checkbox({ label, checked, onChange, className = '', ...rest }) {
  const id = useId();

  return (
    <label htmlFor={id} className={`flex cursor-pointer items-center gap-2 ${className}`}>
      <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={[
            'h-[18px] w-[18px] rounded-md border transition-colors duration-150',
            'border-slate-300 dark:border-ink-600',
            'peer-checked:border-drop-500 peer-checked:bg-drop-500',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-drop-500 peer-focus-visible:ring-offset-2'
          ].join(' ')}
          aria-hidden="true"
        />
        <svg
          className="pointer-events-none absolute h-3 w-3 scale-0 text-white peer-checked:scale-100 transition-transform"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{ opacity: checked ? 1 : 0 }}
        >
          <path
            d="M2 6l2.5 2.5L10 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {label && <span className="text-sm text-ink-700 dark:text-slate-300">{label}</span>}
    </label>
  );
}

export default Checkbox;
