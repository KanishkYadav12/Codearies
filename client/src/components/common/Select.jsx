import { forwardRef, useId } from 'react';

/**
 * Native `<select>`, styled to match Input. A custom-rendered dropdown would
 * need to reimplement keyboard navigation, typeahead and mobile picker
 * behaviour that the browser already provides correctly — not worth rebuilding
 * for a plain filter control.
 */
export const Select = forwardRef(function Select(
  { label, error, options, placeholder, className = '', containerClassName = '', id, ...rest },
  ref
) {
  const autoId = useId();
  const selectId = id || autoId;

  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-sm font-medium text-ink-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}

      <select
        ref={ref}
        id={selectId}
        className={['input-base appearance-none pr-8', error ? 'input-error' : '', className]
          .filter(Boolean)
          .join(' ')}
        aria-invalid={error ? 'true' : undefined}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
});

export default Select;
