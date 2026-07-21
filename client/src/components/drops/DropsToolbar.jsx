import { useEffect, useState } from 'react';

import { useDebounce } from '../../hooks/useDebounce';
import { Select } from '../common/Select';
import { Checkbox } from '../common/Checkbox';
import { DROP_TYPES, SORT_OPTIONS } from '../../constants';
import { useGetCollectionsQuery } from '../../store/api/apiSlice';

const TYPE_OPTIONS = DROP_TYPES.map((type) => ({
  value: type,
  label: type[0].toUpperCase() + type.slice(1)
}));

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private' },
  { value: 'public', label: 'Public' }
];

/**
 * Search + filter + sort bar shared by the Explorer and My Drops pages.
 * Search is debounced locally before it reaches the parent's filter state, so
 * typing does not trigger a request per keystroke.
 */
export function DropsToolbar({ filters, onChange, showVisibility = true, showCollection = false }) {
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const debouncedSearch = useDebounce(searchInput, 350);
  const { data: collections } = useGetCollectionsQuery(undefined, { skip: !showCollection });

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onChange({ search: debouncedSearch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return (
    <div className="surface flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-[200px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-slate-500">
          ⌕
        </span>
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search title, content or tags…"
          aria-label="Search drops"
          className="input-base pl-9"
        />
      </div>

      <Select
        options={TYPE_OPTIONS}
        placeholder="All types"
        value={filters.type || ''}
        onChange={(event) => onChange({ type: event.target.value })}
        containerClassName="w-full sm:w-36"
        aria-label="Filter by type"
      />

      {showVisibility && (
        <Select
          options={VISIBILITY_OPTIONS}
          placeholder="Any visibility"
          value={filters.visibility || ''}
          onChange={(event) => onChange({ visibility: event.target.value })}
          containerClassName="w-full sm:w-36"
          aria-label="Filter by visibility"
        />
      )}

      <Select
        options={SORT_OPTIONS}
        value={filters.sort || 'newest'}
        onChange={(event) => onChange({ sort: event.target.value })}
        containerClassName="w-full sm:w-40"
        aria-label="Sort order"
      />

      {showCollection && collections?.length > 0 && (
        <Select
          options={collections.map((collection) => ({ value: collection.id, label: collection.name }))}
          placeholder="All collections"
          value={filters.collectionId || ''}
          onChange={(event) => onChange({ collectionId: event.target.value })}
          containerClassName="w-full sm:w-40"
          aria-label="Filter by collection"
        />
      )}

      <Checkbox
        label="Favourites only"
        checked={Boolean(filters.favorite)}
        onChange={(event) => onChange({ favorite: event.target.checked })}
      />
    </div>
  );
}

export default DropsToolbar;
