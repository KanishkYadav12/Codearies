import { useState } from 'react';
import { useDispatch } from 'react-redux';

import { Button } from '../common/Button';
import { Select } from '../common/Select';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { clearSelection, pushToast } from '../../store/slices/uiSlice';
import { useBulkActionMutation, useGetCollectionsQuery } from '../../store/api/apiSlice';

/**
 * Floating toolbar that appears once one or more drops are selected in
 * My Drops. All four bulk operations route through the server's single
 * transactional `/drops/bulk` endpoint.
 */
export function BulkActionBar({ selectedIds }) {
  const dispatch = useDispatch();
  const [bulkAction, { isLoading }] = useBulkActionMutation();
  const { data: collections } = useGetCollectionsQuery();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collectionId, setCollectionId] = useState('');

  if (selectedIds.length === 0) {
    return null;
  }

  const run = (action, payload) =>
    bulkAction({ dropIds: selectedIds, action, ...payload })
      .unwrap()
      .then((result) => {
        dispatch(pushToast(`Updated ${result.affected} drop${result.affected === 1 ? '' : 's'}`, 'success'));
        dispatch(clearSelection());
      })
      .catch(() => dispatch(pushToast('Bulk action failed', 'error')));

  return (
    <>
      <div className="sticky bottom-20 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-drop-400/30 bg-white p-3 shadow-lifted animate-slide-up dark:border-drop-500/30 dark:bg-ink-800 lg:bottom-4">
        <span className="text-sm font-medium text-ink-700 dark:text-slate-200">
          {selectedIds.length} selected
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => run('favorite', { isFavorite: true })} loading={isLoading}>
            ★ Favourite
          </Button>
          <Button size="sm" variant="outline" onClick={() => run('visibility', { visibility: 'public' })} loading={isLoading}>
            Make public
          </Button>
          <Button size="sm" variant="outline" onClick={() => run('visibility', { visibility: 'private' })} loading={isLoading}>
            Make private
          </Button>

          {collections?.length > 0 && (
            <Select
              value={collectionId}
              onChange={(event) => {
                setCollectionId(event.target.value);
                if (event.target.value) {
                  run('collection', { collectionId: event.target.value }).then(() => setCollectionId(''));
                }
              }}
              placeholder="Add to collection…"
              options={collections.map((collection) => ({ value: collection.id, label: collection.name }))}
              containerClassName="w-44"
            />
          )}

          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={() => dispatch(clearSelection())}>
            Cancel
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => run('delete').then(() => setConfirmDelete(false))}
        title={`Delete ${selectedIds.length} drop${selectedIds.length === 1 ? '' : 's'}?`}
        description="This also removes their recall history and any links to other drops. This cannot be undone."
        loading={isLoading}
      />
    </>
  );
}

export default BulkActionBar;
