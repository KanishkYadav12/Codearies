/**
 * Loading skeletons (spec: "loading skeletons for all list views").
 *
 * Shape-matched placeholders rather than a generic spinner, so the layout does
 * not jump once real content arrives — the skeleton occupies the same footprint
 * the card will.
 */
export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function DropCardSkeleton() {
  return (
    <div className="surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="mb-2 h-5 w-3/4" />
      <Skeleton className="mb-1 h-3.5 w-full" />
      <Skeleton className="mb-3 h-3.5 w-2/3" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function DropListSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <DropCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="surface p-4 sm:p-5">
      <Skeleton className="mb-3 h-3.5 w-20" />
      <Skeleton className="h-7 w-14" />
    </div>
  );
}

export function CollectionCardSkeleton() {
  return (
    <div className="surface p-5">
      <Skeleton className="mb-4 h-8 w-8 rounded-lg" />
      <Skeleton className="mb-2 h-5 w-2/3" />
      <Skeleton className="h-3.5 w-full" />
    </div>
  );
}

export default Skeleton;
