import { Link } from 'react-router-dom';

import { useGetRecentDropsQuery } from '../../store/api/apiSlice';
import { DropTypeBadge } from '../drops/DropTypeBadge';
import { EmptyState } from '../common/EmptyState';
import { relativeTime } from '../../utils/format';

/** Dashboard's "last 5 created/updated" list. */
export function RecentDrops() {
  const { data, isLoading } = useGetRecentDropsQuery();
  const drops = data || [];

  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Recent drops</h2>
        <Link to="/drops" className="text-xs font-medium text-drop-600 hover:underline dark:text-drop-400">
          View all
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
        <EmptyState emoji="📭" title="No drops yet" description="Capture your first snippet, command, link or note." />
      )}

      {!isLoading && drops.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-ink-800">
          {drops.map((drop) => (
            <li key={drop.id}>
              <Link
                to={`/drops/${drop.id}`}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <DropTypeBadge type={drop.type} showLabel={false} />
                  <span className="truncate text-sm text-ink-800 hover:text-drop-600 dark:text-slate-200 dark:hover:text-drop-400">
                    {drop.title}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-400 dark:text-slate-500">
                  {relativeTime(drop.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default RecentDrops;
