import { useSelector } from 'react-redux';

import { StatCard } from '../components/dashboard/StatCard';
import { RecallQueueCard } from '../components/dashboard/RecallQueueCard';
import { RecentDrops } from '../components/dashboard/RecentDrops';
import { StatCardSkeleton } from '../components/common/Skeleton';
import { useGetStatsQuery } from '../store/api/apiSlice';
import { selectCurrentUser } from '../store/slices/authSlice';

/** Dashboard — the main hub, per the spec's exact requirement list. */
export function DashboardPage() {
  const user = useSelector(selectCurrentUser);
  const { data: stats, isLoading } = useGetStatsQuery();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">
          {greeting}, {user?.username}
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
          Here's where your knowledge stands today.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label="Total drops" value={stats?.totalDrops || 0} icon="▤" />
            <StatCard label="Mastered" value={stats?.masteredDrops || 0} icon="✓" tone="success" />
            <StatCard label="Pending" value={stats?.pendingDrops || 0} icon="⏳" tone="warning" />
            <StatCard
              label="Streak"
              value={stats?.currentStreak || 0}
              icon="🔥"
              tone="brand"
              hint={stats?.currentStreak ? 'days in a row' : 'recall something today'}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecallQueueCard />
        <RecentDrops />
      </div>
    </div>
  );
}

export default DashboardPage;
