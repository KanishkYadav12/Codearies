import { forwardRef } from 'react';

/**
 * The one button component in the app. Every visual variant is a Tailwind
 * class map — frontend constraint #1 forbids a component library, so this is
 * the entire "design system" for buttons.
 */

const VARIANTS = {
  primary:
    'bg-drop-500 text-white shadow-sm hover:bg-drop-600 focus-visible:ring-drop-500 disabled:hover:bg-drop-500',
  secondary:
    'bg-slate-100 text-ink-800 hover:bg-slate-200 dark:bg-ink-800 dark:text-slate-100 dark:hover:bg-ink-700',
  outline:
    'border border-slate-300 text-ink-800 hover:bg-slate-50 dark:border-ink-600 dark:text-slate-100 dark:hover:bg-ink-800',
  ghost:
    'text-ink-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-ink-800',
  danger:
    'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500',
  'danger-ghost':
    'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
};

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-5 py-3 text-base rounded-xl gap-2.5',
  icon: 'p-2 rounded-xl'
};

export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = false,
    leftIcon = null,
    rightIcon = null,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'btn',
        VARIANTS[variant] || VARIANTS.primary,
        SIZES[size] || SIZES.md,
        fullWidth ? 'w-full' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
