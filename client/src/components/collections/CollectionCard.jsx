import { Link } from 'react-router-dom';

import { pluralize } from '../../utils/format';

/** Collection tile — colour-coded per the collection's chosen colour. */
export function CollectionCard({ collection }) {
  return (
    <Link
      to={`/collections/${collection.id}`}
      className="surface-interactive block p-5 animate-fade-in-up"
    >
      <div
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
        style={{ backgroundColor: collection.color }}
        aria-hidden="true"
      >
        {collection.name.charAt(0).toUpperCase()}
      </div>

      <h3 className="mb-1 truncate text-sm font-semibold text-ink-900 dark:text-white">
        {collection.name}
      </h3>

      {collection.description && (
        <p className="mb-3 line-clamp-2 text-xs text-ink-500 dark:text-slate-500">
          {collection.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-ink-400 dark:text-slate-500">
        <span>{pluralize(collection.dropCount, 'drop')}</span>
        {collection.isShared && (
          <span className="flex items-center gap-1 font-medium text-drop-600 dark:text-drop-400">
            <span aria-hidden="true">🔗</span> Shared
          </span>
        )}
      </div>
    </Link>
  );
}

export default CollectionCard;
