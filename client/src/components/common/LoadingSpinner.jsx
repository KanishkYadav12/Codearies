/**
 * Small inline spinner for buttons and inline loading states. Page-level
 * loading uses Skeleton.jsx instead, per the spec's "loading skeletons for
 * all list views" requirement — a spinner is reserved for actions in flight.
 */
export function LoadingSpinner({ size = 'md', className = '', label = 'Loading' }) {
  const sizes = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-[3px]' };

  return (
    <span
      role="status"
      aria-label={label}
      className={[
        'inline-block animate-spin rounded-full border-current border-t-transparent text-drop-500',
        sizes[size] || sizes.md,
        className
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading DevDrops…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-500 dark:text-slate-500">
      <LoadingSpinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export default LoadingSpinner;
