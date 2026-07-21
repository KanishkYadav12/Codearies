import { Link } from 'react-router-dom';

import { useGetRelatedDropsQuery, useRelateDropsMutation, useUnrelateDropsMutation } from '../../store/api/apiSlice';
import { DropTypeBadge } from './DropTypeBadge';
import { Button } from '../common/Button';
import { LoadingSpinner } from '../common/LoadingSpinner';

/**
 * Related-drops panel on the detail page: the drops explicitly linked to this
 * one, plus server-suggested candidates the user can link with one click.
 */
export function RelatedDrops({ dropId, isOwner }) {
  const { data, isLoading } = useGetRelatedDropsQuery(dropId);
  const [relateDrops, { isLoading: isLinking }] = useRelateDropsMutation();
  const [unrelateDrops] = useUnrelateDropsMutation();

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner />
      </div>
    );
  }

  const related = data?.related || [];
  const suggested = data?.suggested || [];

  if (!related.length && !suggested.length) {
    return (
      <p className="py-4 text-center text-sm text-ink-500 dark:text-slate-500">
        No related drops found yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {related.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-500">
            Linked ({related.length})
          </h4>
          <div className="space-y-2">
            {related.map((drop) => (
              <div
                key={drop.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5 dark:border-ink-700"
              >
                <Link to={`/drops/${drop.id}`} className="flex min-w-0 items-center gap-2">
                  <DropTypeBadge type={drop.type} showLabel={false} />
                  <span className="truncate text-sm text-ink-800 hover:text-drop-600 dark:text-slate-200 dark:hover:text-drop-400">
                    {drop.title}
                  </span>
                </Link>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => unrelateDrops({ id: dropId, relatedDropId: drop.id })}
                    aria-label={`Remove link to ${drop.title}`}
                    className="shrink-0 rounded p-1 text-ink-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwner && suggested.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-500">
            Suggested
          </h4>
          <div className="space-y-2">
            {suggested.map((drop) => (
              <div
                key={drop.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 p-2.5 dark:border-ink-600"
              >
                <Link to={`/drops/${drop.id}`} className="flex min-w-0 items-center gap-2">
                  <DropTypeBadge type={drop.type} showLabel={false} />
                  <span className="truncate text-sm text-ink-800 dark:text-slate-200">{drop.title}</span>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  loading={isLinking}
                  onClick={() => relateDrops({ id: dropId, relatedDropId: drop.id })}
                >
                  Link
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default RelatedDrops;
