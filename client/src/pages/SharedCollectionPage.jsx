import { useParams, Link } from 'react-router-dom';

import { useGetSharedCollectionQuery } from '../store/api/apiSlice';
import { DropTypeBadge } from '../components/drops/DropTypeBadge';
import { Markdown } from '../components/drops/Markdown';
import { TagChip } from '../components/drops/TagChip';
import { PageLoader } from '../components/common/LoadingSpinner';
import { pluralize } from '../utils/format';

/**
 * Public, read-only view of a shared collection (no auth required).
 * Lightweight by design: no sidebar, no nav, just the content and a link back
 * to DevDrops for anyone who follows a shared link.
 */
export function SharedCollectionPage() {
  const { token } = useParams();
  const { data, isLoading, isError } = useGetSharedCollectionQuery(token);

  if (isLoading) {
    return <PageLoader />;
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-4xl">🔗</p>
        <h1 className="text-lg font-semibold text-ink-900 dark:text-white">Link not found</h1>
        <p className="text-sm text-ink-500 dark:text-slate-400">
          This share link may have been revoked or never existed.
        </p>
        <Link to="/login" className="text-sm font-medium text-drop-600 hover:underline dark:text-drop-400">
          Go to DevDrops
        </Link>
      </div>
    );
  }

  const { collection, drops } = data;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-ink-950">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold text-white"
            style={{ backgroundColor: collection.color }}
          >
            {collection.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">{collection.name}</h1>
          {collection.description && (
            <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">{collection.description}</p>
          )}
          <p className="mt-2 text-xs text-ink-400 dark:text-slate-500">
            Shared by {collection.owner} · {pluralize(collection.dropCount, 'drop')}
            {collection.hiddenCount > 0 &&
              ` (${collection.hiddenCount} private ${collection.hiddenCount === 1 ? 'drop' : 'drops'} hidden)`}
          </p>
        </div>

        {drops.length === 0 ? (
          <p className="text-center text-sm text-ink-500 dark:text-slate-500">
            Nothing public to show in this collection yet.
          </p>
        ) : (
          <div className="space-y-4">
            {drops.map((drop) => (
              <div key={drop.id} className="surface p-5">
                <div className="mb-2 flex items-center gap-2">
                  <DropTypeBadge type={drop.type} />
                  {drop.language && (
                    <span className="font-mono text-xs text-ink-500 dark:text-slate-500">{drop.language}</span>
                  )}
                </div>
                <h2 className="mb-2 text-base font-semibold text-ink-900 dark:text-white">{drop.title}</h2>
                <Markdown content={drop.content} />
                {drop.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {drop.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-ink-400 dark:text-slate-600">
          Powered by{' '}
          <Link to="/login" className="font-medium text-drop-600 hover:underline dark:text-drop-400">
            DevDrops
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SharedCollectionPage;
