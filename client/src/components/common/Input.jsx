import { forwardRef, useId } from 'react';

/**
 * Text input / textarea with a label, hint and error message wired for
 * accessibility: the label is a real `<label htmlFor>`, and the error is
 * announced via `aria-describedby` + `role="alert"` so a screen reader user
 * hears it the moment it appears, not just sees red text.
 */
export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    as = 'input',
    className = '',
    containerClassName = '',
    required = false,
    id,
    ...rest
  },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const Component = as === 'textarea' ? 'textarea' : 'input';

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-slate-300"
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}

      <Component
        ref={ref}
        id={inputId}
        className={['input-base', error ? 'input-error' : '', className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        aria-required={required || undefined}
        {...rest}
      />

      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-500 dark:text-slate-500">
          {hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
