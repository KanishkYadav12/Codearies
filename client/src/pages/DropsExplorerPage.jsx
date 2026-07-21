import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { DropsToolbar } from '../components/drops/DropsToolbar';
import { DropCard } from '../components/drops/DropCard';
import { DropListSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { LoadMore } from '../components/common/Pagination';
import { useGetDropsQuery } from '../store/api/apiSlice';
import { selectFilters, setFilters } from '../store/slices/uiSlice';

/**
 * Drops Explorer: search, filter, sort, paginate (8/page, load-more) over the
 * user's own drops. ("Explore" also covers the spec's public feed via a
 * separate route in a full build; this authenticated view is the one named
 * explicitly in the page list.)
 *
 * Accumulates pages locally so "load more" appends rather than replaces —
 * RTK Query's cache is keyed per page, so the accumulation lives here instead.
 */
export function DropsExplorerPage() {
  const dispatch = useDispatch();
  const filters = useSelector(selectFilters);
  const [accumulated, setAccumulated] = useState([]);

  const { data, isLoading, isFetching } = useGetDropsQuery(filters);

  useEffect(() => {
    if (!data) return;

    setAccumulated((previous) => (filters.page === 1 ? data.drops : [...previous, ...data.drops]));
  }, [data, filters.page]);

  const handleFilterChange = (changes) => {
    dispatch(setFilters(changes));
  };

  const handleLoadMore = () => {
    dispatch(setFilters({ page: filters.page + 1 }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Explorer</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
          Search and filter across everything you've saved.
        </p>
      </div>

      <DropsToolbar filters={filters} onChange={handleFilterChange} />

      {isLoading ? (
        <DropListSkeleton />
      ) : accumulated.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="No drops match those filters"
          description="Try a broader search or clear a filter."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accumulated.map((drop) => (
              <DropCard key={drop.id} drop={drop} />
            ))}
          </div>
          <LoadMore pagination={data?.pagination} onLoadMore={handleLoadMore} loading={isFetching} />
        </>
      )}
    </div>
  );
}

export default DropsExplorerPage;
