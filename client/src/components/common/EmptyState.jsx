/**
 * Empty states with emoji-based art (spec's exact wording). No icon library —
 * an emoji is a zero-dependency, theme-proof illustration.
 */
export function EmptyState({ emoji = '🗂️', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center dark:border-ink-700">
      <span className="animate-bounce-soft text-5xl" aria-hidden="true">
        {emoji}
      </span>
      <div>
        <h3 className="text-sm font-semibold text-ink-800 dark:text-slate-200">{title}</h3>
        {description && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500 dark:text-slate-500">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export default EmptyState;
