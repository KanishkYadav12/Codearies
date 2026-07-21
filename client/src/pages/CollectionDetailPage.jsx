import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';

import {
  useDeleteCollectionMutation,
  useGetCollectionQuery,
  useRemoveDropFromCollectionMutation,
  useShareCollectionMutation,
  useUnshareCollectionMutation,
  useUpdateCollectionMutation
} from '../store/api/apiSlice';
import { pushToast } from '../store/slices/uiSlice';

import { DropCard } from '../components/drops/DropCard';
import { CollectionForm } from '../components/collections/CollectionForm';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { EmptyState } from '../components/common/EmptyState';
import { DropListSkeleton } from '../components/common/Skeleton';
import { Pagination } from '../components/common/Pagination';
import { pluralize } from '../utils/format';

export function CollectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useGetCollectionQuery({ id, page });
  const [updateCollection] = useUpdateCollectionMutation();
  const [deleteCollection, { isLoading: isDeleting }] = useDeleteCollectionMutation();
  const [shareCollection, { isLoading: isSharing }] = useShareCollectionMutation();
  const [unshareCollection] = useUnshareCollectionMutation();
  const [removeDrop] = useRemoveDropFromCollectionMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return <DropListSkeleton />;
  }

  const collection = data?.collection;

  if (!collection) {
    return null;
  }

  const handleShare = () => {
    shareCollection(id)
      .unwrap()
      .then((result) => {
        navigator.clipboard?.writeText(result.shareUrl).catch(() => {});
        setCopied(true);
        dispatch(pushToast('Share link copied to clipboard', 'success'));
        setTimeout(() => setCopied(false), 2000);
      });
  };

  const handleDelete = () => {
    deleteCollection(id)
      .unwrap()
      .then(() => {
        dispatch(pushToast('Collection deleted — its drops were kept', 'success'));
        navigate('/collections');
      });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <button
        type="button"
        onClick={() => navigate('/collections')}
        className="flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← All collections
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: collection.color }}
            aria-hidden="true"
          >
            {collection.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink-900 dark:text-white">{collection.name}</h1>
            <p className="text-sm text-ink-500 dark:text-slate-400">
              {pluralize(collection.dropCount, 'drop')}
              {collection.description ? ` · ${collection.description}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Rename
          </Button>
          {collection.isShared ? (
            <>
              <Button variant="outline" onClick={handleShare} loading={isSharing}>
                {copied ? 'Copied!' : 'Copy link'}
              </Button>
              <Button variant="ghost" onClick={() => unshareCollection(id)}>
                Unshare
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleShare} loading={isSharing}>
              Share
            </Button>
          )}
          <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        </div>
      </div>

      {data.drops.length === 0 ? (
        <EmptyState emoji="📦" title="This collection is empty" description="Add drops to it from any drop's detail page." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.drops.map((drop) => (
              <div key={drop.id} className="relative">
                <DropCard drop={drop} />
                <button
                  type="button"
                  onClick={() => removeDrop({ id, dropId: drop.id })}
                  className="absolute right-3 top-3 rounded-full bg-white/90 p-1 text-xs text-ink-500 shadow hover:text-rose-500 dark:bg-ink-800/90 dark:text-slate-400"
                  aria-label={`Remove ${drop.title} from collection`}
                  title="Remove from collection"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <Pagination pagination={data.pagination} onPageChange={setPage} />
        </>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit collection">
        <CollectionForm
          initialValues={{ name: collection.name, description: collection.description, color: collection.color }}
          submitLabel="Save changes"
          onCancel={() => setEditOpen(false)}
          onSubmit={(values) =>
            updateCollection({ id, ...values })
              .unwrap()
              .then(() => {
                dispatch(pushToast('Collection updated', 'success'));
                setEditOpen(false);
              })
          }
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this collection?"
        description="The drops inside it are not deleted — only the collection itself."
        loading={isDeleting}
      />
    </div>
  );
}

export default CollectionDetailPage;
