import { Link } from 'react-router-dom';

import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { DropTypeBadge } from '../drops/DropTypeBadge';
import { recallStatus } from '../../utils/format';
import { useGetRecallQueueQuery } from '../../store/api/apiSlice';

/** Dashboard's recall queue widget — a preview with a count badge and a CTA into full recall mode. */
export function RecallQueueCard() {
  const { data, isLoading } = useGetRecallQueueQuery({ limit: 4 });

  const drops = data?.drops || [];

  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900 dark:text-white">
          Recall queue
          {drops.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
              {data?.total ?? drops.length}
            </span>
          )}
        </h2>
        <Link to="/recall">
          <Button size="sm" variant={drops.length ? 'primary' : 'outline'}>
            {drops.length ? 'Start reviewing' : 'Recall mode'}
          </Button>
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((key) => (
            <div key={key} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && drops.length === 0 && (
        <EmptyState emoji="🌤️" title="Nothing due right now" description="New drops become due for recall an hour after you save them." />
      )}

      {!isLoading && drops.length > 0 && (
        <ul className="space-y-2">
          {drops.map((drop) => {
            const status = recallStatus(drop.nextRecallDate);
            return (
              <li key={drop.id}>
                <Link
                  to="/recall"
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 transition-colors hover:border-drop-400/40 hover:bg-drop-500/5 dark:border-ink-700"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <DropTypeBadge type={drop.type} showLabel={false} />
                    <span className="truncate text-sm text-ink-800 dark:text-slate-200">{drop.title}</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-rose-500 dark:text-rose-400">
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default RecallQueueCard;
