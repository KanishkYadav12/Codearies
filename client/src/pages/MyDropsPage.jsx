import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { DropsToolbar } from '../components/drops/DropsToolbar';
import { DropCard } from '../components/drops/DropCard';
import { BulkActionBar } from '../components/drops/BulkActionBar';
import { DropListSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { LoadMore } from '../components/common/Pagination';
import { Button } from '../components/common/Button';
import {
  clearSelection,
  selectFilters,
  selectSelectedDropIds,
  selectViewMode,
  setCreateDropOpen,
  setFilters,
  setViewMode,
  toggleDropSelection
} from '../store/slices/uiSlice';
import { useGetDropsQuery } from '../store/api/apiSlice';

const TABS = [
  { key: 'all', label: 'All', params: {} },
  { key: 'favorite', label: 'Favourite', params: { favorite: true } },
  { key: 'due', label: 'Due for recall', params: { due: true } },
  { key: 'mastered', label: 'Mastered', params: { mastered: true } }
];

/**
 * My Drops: tabs, grid/list toggle, bulk selection and actions, search — the
 * ownership-scoped counterpart to the Explorer.
 */
export function MyDropsPage() {
  const dispatch = useDispatch();
  const filters = useSelector(selectFilters);
  const viewMode = useSelector(selectViewMode);
  const selectedIds = useSelector(selectSelectedDropIds);

  const [activeTab, setActiveTab] = useState('all');
  const [accumulated, setAccumulated] = useState([]);

  const tabParams = TABS.find((tab) => tab.key === activeTab)?.params || {};
  const queryArgs = { ...filters, ...tabParams };

  const { data, isLoading, isFetching } = useGetDropsQuery(queryArgs);

  useEffect(() => {
    if (!data) return;
    setAccumulated((previous) => (filters.page === 1 ? data.drops : [...previous, ...data.drops]));
  }, [data, filters.page]);

  useEffect(() => {
    dispatch(clearSelection());
  }, [activeTab, dispatch]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    dispatch(setFilters({ page: 1 }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">My Drops</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
            Everything you've captured, organised your way.
          </p>
        </div>
        <Button onClick={() => dispatch(setCreateDropOpen(true))} leftIcon={<span aria-hidden="true">+</span>}>
          New drop
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 overflow-x-auto">
        <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-ink-800">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-drop-600 shadow-sm dark:bg-ink-700 dark:text-drop-400'
                  : 'text-ink-500 hover:text-ink-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 gap-1 rounded-lg border border-slate-200 p-1 dark:border-ink-700">
          <button
            type="button"
            onClick={() => dispatch(setViewMode('grid'))}
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            className={`rounded-md p-1.5 text-sm ${viewMode === 'grid' ? 'bg-slate-100 dark:bg-ink-700' : ''}`}
          >
            ▦
          </button>
          <button
            type="button"
            onClick={() => dispatch(setViewMode('list'))}
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            className={`rounded-md p-1.5 text-sm ${viewMode === 'list' ? 'bg-slate-100 dark:bg-ink-700' : ''}`}
          >
            ☰
          </button>
        </div>
      </div>

      <DropsToolbar
        filters={filters}
        onChange={(changes) => dispatch(setFilters(changes))}
        showCollection
      />

      {isLoading ? (
        <DropListSkeleton />
      ) : accumulated.length === 0 ? (
        <EmptyState
          emoji="✨"
          title="Nothing here yet"
          description="Create your first drop to see it appear in this tab."
          action={
            <Button variant="outline" onClick={() => dispatch(setCreateDropOpen(true))}>
              Create a drop
            </Button>
          }
        />
      ) : (
        <>
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'grid grid-cols-1 gap-3'
            }
          >
            {accumulated.map((drop) => (
              <DropCard
                key={drop.id}
                drop={drop}
                selectable
                selected={selectedIds.includes(drop.id)}
                onToggleSelect={(id) => dispatch(toggleDropSelection(id))}
              />
            ))}
          </div>
          <LoadMore
            pagination={data?.pagination}
            onLoadMore={() => dispatch(setFilters({ page: filters.page + 1 }))}
            loading={isFetching}
          />
        </>
      )}

      <BulkActionBar selectedIds={selectedIds} />
    </div>
  );
}

export default MyDropsPage;
