import { Button } from './Button';

/** "Load more" pagination (spec: 8 per page, load-more button). */
export function LoadMore({ pagination, onLoadMore, loading }) {
  if (!pagination || !pagination.hasMore) {
    return null;
  }

  return (
    <div className="flex justify-center pt-2">
      <Button variant="outline" onClick={onLoadMore} loading={loading}>
        Load more ({pagination.total - pagination.page * pagination.limit > 0
          ? pagination.total - pagination.page * pagination.limit
          : pagination.total} remaining)
      </Button>
    </div>
  );
}

/** Numbered pager for pages that prefer explicit page jumps (collection view). */
export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 pt-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pagination.page <= 1}
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Previous
      </Button>
      <span className="text-sm text-ink-500 dark:text-slate-500">
        Page {pagination.page} of {pagination.totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={!pagination.hasMore}
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

export default Pagination;
