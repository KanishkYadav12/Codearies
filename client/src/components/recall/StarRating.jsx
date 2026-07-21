/** 1-5 confidence rating used after revealing a drop in recall mode. */
export function StarRating({ value = 0, onChange, hoverLabel }) {
  return (
    <div role="radiogroup" aria-label="Recall confidence" className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} out of 5 — ${hoverLabel?.(star) || ''}`}
          onClick={() => onChange(star)}
          className="rounded p-1 transition-transform hover:scale-110 active:scale-95"
        >
          <svg
            viewBox="0 0 20 20"
            fill={star <= value ? '#fbbf24' : 'none'}
            stroke={star <= value ? '#fbbf24' : 'currentColor'}
            strokeWidth="1.5"
            className="h-7 w-7 text-slate-300 dark:text-ink-600"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 2.5l2.4 4.86 5.36.78-3.88 3.78.92 5.34L10 14.77l-4.8 2.5.92-5.34-3.88-3.78 5.36-.78L10 2.5z"
            />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default StarRating;
