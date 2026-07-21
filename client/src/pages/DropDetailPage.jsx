import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';

import {
  useDeleteDropMutation,
  useGetCollectionsQuery,
  useGetDropQuery,
  useAddDropToCollectionMutation,
  useRecallDropMutation,
  useUpdateDropMutation
} from '../store/api/apiSlice';
import { pushToast } from '../store/slices/uiSlice';

import { DropTypeBadge } from '../components/drops/DropTypeBadge';
import { TagChip } from '../components/drops/TagChip';
import { FavoriteStar } from '../components/drops/FavoriteStar';
import { Markdown } from '../components/drops/Markdown';
import { RelatedDrops } from '../components/drops/RelatedDrops';
import { DropForm } from '../components/drops/DropForm';
import { Button } from '../components/common/Button';
import { Select } from '../components/common/Select';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageLoader } from '../components/common/LoadingSpinner';
import { Card } from '../components/common/Card';
import { dateTime, relativeTime } from '../utils/format';
import { formatInterval } from '../utils/fibonacci';

export function DropDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { data, isLoading, isError } = useGetDropQuery(id);
  const [recallDrop, { isLoading: isRecalling }] = useRecallDropMutation();
  const [deleteDrop, { isLoading: isDeleting }] = useDeleteDropMutation();
  const [updateDrop] = useUpdateDropMutation();
  const { data: collections } = useGetCollectionsQuery();
  const [addDropToCollection] = useAddDropToCollectionMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (isLoading) {
    return <PageLoader />;
  }

  if (isError || !data?.drop) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-4xl">🕳️</p>
        <h1 className="mt-3 text-lg font-semibold text-ink-900 dark:text-white">Drop not found</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-slate-400">
          It may have been deleted, or it's private and belongs to someone else.
        </p>
        <Link to="/drops" className="mt-4 inline-block">
          <Button variant="outline">Back to My Drops</Button>
        </Link>
      </div>
    );
  }

  const { drop, history, schedule } = data;

  const handleRecall = () => {
    recallDrop({ id: drop.id, recallType: 'manual' })
      .unwrap()
      .then((result) => {
        dispatch(
          pushToast(
            result.justMastered ? `Mastered! Next review in ${result.intervalLabel} 🎉` : `Recalled — next review in ${result.intervalLabel}`,
            'success'
          )
        );
      })
      .catch(() => dispatch(pushToast('Could not record that recall', 'error')));
  };

  const handleDelete = () => {
    deleteDrop(drop.id)
      .unwrap()
      .then(() => {
        dispatch(pushToast('Drop deleted', 'success'));
        navigate('/drops');
      });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card padding="lg">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <DropTypeBadge type={drop.type} />
                {drop.language && (
                  <span className="font-mono text-xs text-ink-500 dark:text-slate-500">{drop.language}</span>
                )}
                {drop.visibility === 'public' && <span className="badge border-drop-400/30 bg-drop-500/10 text-drop-600 dark:text-drop-400">Public</span>}
              </div>
              <FavoriteStar dropId={drop.id} isFavorite={drop.isFavorite} />
            </div>

            <h1 className="mb-4 text-xl font-semibold text-ink-900 dark:text-white break-anywhere">
              {drop.title}
            </h1>

            <Markdown content={drop.content} />

            {drop.tags?.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {drop.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </div>
            )}
          </Card>

          {drop.isOwner && (
            <Card>
              <h2 className="mb-3 text-sm font-semibold text-ink-900 dark:text-white">
                Recall history
              </h2>
              {history?.length ? (
                <ul className="space-y-1.5 text-sm text-ink-600 dark:text-slate-400">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between">
                      <span>{dateTime(entry.recalledAt)}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs capitalize text-ink-400 dark:text-slate-500">{entry.recallType}</span>
                        {entry.confidence && (
                          <span className="text-amber-500">{'★'.repeat(entry.confidence)}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-500 dark:text-slate-500">No recalls yet.</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {drop.isOwner && (
            <Card>
              <Button fullWidth onClick={handleRecall} loading={isRecalling}>
                Recall this drop
              </Button>
              <p className="mt-2 text-center text-xs text-ink-400 dark:text-slate-500">
                Next scheduled: {relativeTime(drop.nextRecallDate)}
              </p>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-500">
              Statistics
            </h2>
            <dl className="space-y-2 text-sm">
              <Stat label="Total recalls" value={drop.recallCount} />
              <Stat label="Next recall" value={relativeTime(drop.nextRecallDate)} />
              <Stat label="Created" value={dateTime(drop.createdAt)} />
              <Stat label="Updated" value={relativeTime(drop.updatedAt)} />
            </dl>

            {drop.isOwner && schedule?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-ink-700">
                <p className="mb-1.5 text-xs text-ink-500 dark:text-slate-500">Upcoming ladder</p>
                <div className="flex flex-wrap gap-1">
                  {schedule.slice(0, 6).map((step) => (
                    <span
                      key={step.step}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 dark:bg-ink-800 dark:text-slate-400"
                    >
                      {formatInterval(step.intervalHours)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {drop.isOwner && collections?.length > 0 && (
            <Card>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-500">
                Add to collection
              </h2>
              <Select
                placeholder="Choose a collection…"
                options={collections.map((collection) => ({ value: collection.id, label: collection.name }))}
                onChange={(event) => {
                  if (!event.target.value) return;
                  addDropToCollection({ id: event.target.value, dropId: drop.id })
                    .unwrap()
                    .then(() => dispatch(pushToast('Added to collection', 'success')));
                }}
              />
            </Card>
          )}

          <Card>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-slate-500">
              Related drops
            </h2>
            <RelatedDrops dropId={drop.id} isOwner={drop.isOwner} />
          </Card>

          {drop.isOwner && (
            <div className="flex gap-2">
              <Button variant="outline" fullWidth onClick={() => setEditOpen(true)}>
                Edit
              </Button>
              <Button variant="danger-ghost" fullWidth onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit drop" size="lg">
        <DropForm
          initialValues={{
            title: drop.title,
            content: drop.content,
            type: drop.type,
            language: drop.language || '',
            tags: drop.tags,
            visibility: drop.visibility
          }}
          submitLabel="Save changes"
          onCancel={() => setEditOpen(false)}
          onSubmit={(payload) =>
            updateDrop({ id: drop.id, ...payload })
              .unwrap()
              .then(() => {
                dispatch(pushToast('Drop updated', 'success'));
                setEditOpen(false);
              })
          }
        />
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete this drop?"
        description="This removes its recall history and any links from other drops. This cannot be undone."
        loading={isDeleting}
      />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-500 dark:text-slate-500">{label}</dt>
      <dd className="font-medium text-ink-800 dark:text-slate-200">{value}</dd>
    </div>
  );
}

export default DropDetailPage;
