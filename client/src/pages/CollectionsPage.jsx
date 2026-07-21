import { useState } from 'react';
import { useDispatch } from 'react-redux';

import { useCreateCollectionMutation, useGetCollectionsQuery } from '../store/api/apiSlice';
import { pushToast } from '../store/slices/uiSlice';

import { CollectionCard } from '../components/collections/CollectionCard';
import { CollectionForm } from '../components/collections/CollectionForm';
import { CollectionCardSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';

export function CollectionsPage() {
  const dispatch = useDispatch();
  const { data: collections, isLoading } = useGetCollectionsQuery();
  const [createCollection] = useCreateCollectionMutation();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 dark:text-white">Collections</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
            Group related drops together and share them if you like.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} leftIcon={<span aria-hidden="true">+</span>}>
          New collection
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <CollectionCardSkeleton key={key} />
          ))}
        </div>
      ) : collections?.length === 0 ? (
        <EmptyState
          emoji="🗃️"
          title="No collections yet"
          description="Bundle related drops into a folder you can share with a link."
          action={<Button onClick={() => setCreateOpen(true)}>Create your first collection</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New collection">
        <CollectionForm
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) =>
            createCollection(values)
              .unwrap()
              .then(() => {
                dispatch(pushToast('Collection created', 'success'));
                setCreateOpen(false);
              })
          }
        />
      </Modal>
    </div>
  );
}

export default CollectionsPage;
