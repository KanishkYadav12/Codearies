/**
 * Generic surface container. Most of the app's chrome — dashboard tiles, drop
 * cards, form panels — is this component with different padding and an
 * `interactive` flag for the hover-lift treatment.
 */
export function Card({
  interactive = false,
  padding = 'md',
  className = '',
  children,
  as: Component = 'div',
  ...rest
}) {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-8'
  };

  return (
    <Component
      className={[
        interactive ? 'surface-interactive' : 'surface',
        paddings[padding] || paddings.md,
        className
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-ink-900 dark:text-white">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-ink-500 dark:text-slate-500">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default Card;
