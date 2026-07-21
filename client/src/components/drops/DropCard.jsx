import { Link } from 'react-router-dom';

import { DropTypeBadge } from './DropTypeBadge';
import { TagChip } from './TagChip';
import { FavoriteStar } from './FavoriteStar';
import { Checkbox } from '../common/Checkbox';
import { previewText } from '../../utils/markdownParser';
import { relativeTime, recallStatus } from '../../utils/format';
import { masteryProgress } from '../../utils/fibonacci';

/**
 * The card used everywhere a list of drops is rendered — dashboard, explorer,
 * my drops, collection detail. One component means one place to fix a layout
 * bug rather than four.
 */
export function DropCard({
  drop,
  selectable = false,
  selected = false,
  onToggleSelect,
  showMastery = true
}) {
  const status = recallStatus(drop.nextRecallDate);
  const progress = masteryProgress(drop.recallCount);

  return (
    <div className="surface-interactive group relative flex flex-col p-4 sm:p-5 animate-fade-in-up">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {selectable && (
            <Checkbox
              checked={selected}
              onChange={() => onToggleSelect?.(drop.id)}
              aria-label={`Select ${drop.title}`}
            />
          )}
          <DropTypeBadge type={drop.type} />
          {drop.language && (
            <span className="font-mono text-[11px] text-ink-500 dark:text-slate-500">
              {drop.language}
            </span>
          )}
        </div>
        <FavoriteStar dropId={drop.id} isFavorite={drop.isFavorite} size="sm" />
      </div>

      <Link to={`/drops/${drop.id}`} className="flex-1">
        <h3 className="mb-1.5 line-clamp-2 text-sm font-semibold text-ink-900 group-hover:text-drop-600 dark:text-white dark:group-hover:text-drop-400">
          {drop.title}
        </h3>
        <p className="mb-3 line-clamp-2 break-anywhere text-xs text-ink-500 dark:text-slate-400">
          {previewText(drop.content, 90)}
        </p>
      </Link>

      {drop.tags?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {drop.tags.slice(0, 4).map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      )}

      {showMastery && (
        <div
          className="mb-2.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-700"
          role="progressbar"
          aria-label="Mastery progress"
          aria-valuenow={drop.recallCount}
          aria-valuemin={0}
          aria-valuemax={5}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              drop.isMastered ? 'bg-emerald-500' : 'bg-drop-500'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-ink-500 dark:text-slate-500">
        <span
          className={
            status.due
              ? 'font-medium text-rose-500 dark:text-rose-400'
              : status.tone === 'soon'
                ? 'font-medium text-amber-500 dark:text-amber-400'
                : ''
          }
        >
          {status.label}
        </span>
        <span>{drop.recallCount === 0 ? 'Never recalled' : `${drop.recallCount}× recalled`}</span>
      </div>

      {drop.visibility === 'public' && (
        <span
          className="absolute right-3 top-3 rounded-full bg-drop-500/10 p-1 text-drop-500 opacity-0 transition-opacity group-hover:opacity-100"
          title="Public drop"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3" aria-hidden="true">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM2.5 8a5.5 5.5 0 019.9-3.3L4.7 12.4A5.47 5.47 0 012.5 8zm3.6 4.8L13.8 5A5.5 5.5 0 015.6 12.4l.5.4z" />
          </svg>
        </span>
      )}

      <span className="mt-2 text-[10px] text-ink-400 dark:text-slate-600">
        {relativeTime(drop.updatedAt)}
      </span>
    </div>
  );
}

export default DropCard;
