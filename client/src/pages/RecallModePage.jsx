import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useRecallQueue } from '../hooks/useRecallQueue';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcut';
import { DropTypeBadge } from '../components/drops/DropTypeBadge';
import { TagChip } from '../components/drops/TagChip';
import { Markdown } from '../components/drops/Markdown';
import { StarRating } from '../components/recall/StarRating';
import { Confetti } from '../components/common/Confetti';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PageLoader } from '../components/common/LoadingSpinner';

const CONFIDENCE_LABELS = {
  1: 'Total blank',
  2: 'Struggled',
  3: 'Got there',
  4: 'Confident',
  5: 'Instant recall'
};

/**
 * Recall mode — the interactive spaced-repetition review screen.
 *
 * State machine per card: hidden -> revealed -> (rated ->) advance. The
 * `useRecallQueue` hook owns the queue and the session; this component is
 * responsible for the reveal/rate interaction and its keyboard bindings
 * (Space / R / N / 1-5, per the spec).
 */
export function RecallModePage() {
  const {
    current,
    revealed,
    queue,
    isLoading,
    isEmpty,
    isSubmitting,
    progress,
    sessionActive,
    begin,
    reveal,
    remembered,
    needsReview,
    answer,
    finish
  } = useRecallQueue();

  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!sessionActive && !isLoading && !isEmpty) {
      begin();
    }
    // Only re-run when the queue transitions from unknown -> known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isEmpty]);

  const submitAnswer = (confidence) => {
    answer(confidence).then((result) => {
      if (result?.justMastered) {
        setCelebrate(true);
        setTimeout(() => setCelebrate(false), 2600);
      }
    });
  };

  useKeyboardShortcuts(
    {
      space: () => (revealed ? undefined : reveal()),
      r: () => (revealed ? submitAnswer(4) : reveal()),
      n: () => revealed && submitAnswer(1),
      1: () => revealed && submitAnswer(1),
      2: () => revealed && submitAnswer(2),
      3: () => revealed && submitAnswer(3),
      4: () => revealed && submitAnswer(4),
      5: () => revealed && submitAnswer(5)
    },
    { enabled: Boolean(current) }
  );

  if (isLoading) {
    return <PageLoader label="Loading your recall queue…" />;
  }

  if (isEmpty) {
    return (
      <div className="mx-auto max-w-md py-10">
        <EmptyState
          emoji="🌤️"
          title="All caught up"
          description="Nothing is due for recall right now. New drops become reviewable an hour after you save them."
          action={
            <Link to="/">
              <Button variant="outline">Back to dashboard</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-4">
      <Confetti active={celebrate} />

      <div className="mb-6 w-full">
        <div className="mb-2 flex items-center justify-between text-xs text-ink-500 dark:text-slate-500">
          <span>
            {progress.done} of {progress.total} recalled today
          </span>
          <button
            type="button"
            onClick={finish}
            className="font-medium text-ink-600 hover:text-ink-900 dark:text-slate-400 dark:hover:text-white"
          >
            End session
          </button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-ink-800">
          <div
            className="h-full rounded-full bg-drop-500 transition-all duration-500"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {current && (
        <div key={current.id} className="w-full animate-fade-in-up">
          <div className="surface p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <DropTypeBadge type={current.type} />
              <span className="text-xs text-ink-400 dark:text-slate-500">
                {queue.length} remaining
              </span>
            </div>

            <h2 className="mb-4 text-center text-lg font-semibold text-ink-900 dark:text-white">
              {current.title}
            </h2>

            {!revealed && (
              <div className="flex flex-col items-center gap-6 py-8">
                <p className="text-sm text-ink-500 dark:text-slate-500">
                  Try to recall this before revealing it.
                </p>
                <Button size="lg" onClick={reveal}>
                  Reveal <kbd className="ml-1 rounded bg-white/20 px-1.5 text-xs">Space</kbd>
                </Button>
              </div>
            )}

            {revealed && (
              <div className="animate-reveal-content">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-ink-700 dark:bg-ink-800/50">
                  <Markdown content={current.content} />
                </div>

                {current.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {current.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} />
                    ))}
                  </div>
                )}

                <div className="mt-6 border-t border-slate-100 pt-6 text-center dark:border-ink-700">
                  <p className="mb-3 text-sm font-medium text-ink-700 dark:text-slate-300">
                    How well did you remember it?
                  </p>
                  <StarRating
                    value={0}
                    onChange={submitAnswer}
                    hoverLabel={(star) => CONFIDENCE_LABELS[star]}
                  />

                  <div className="mt-5 flex justify-center gap-3">
                    <Button
                      variant="outline"
                      onClick={() => submitAnswer(1)}
                      loading={isSubmitting}
                      leftIcon={<span aria-hidden="true">↺</span>}
                    >
                      Need to Review <kbd className="ml-1 text-[10px] opacity-60">N</kbd>
                    </Button>
                    <Button
                      onClick={() => submitAnswer(4)}
                      loading={isSubmitting}
                      leftIcon={<span aria-hidden="true">✓</span>}
                    >
                      I Remembered <kbd className="ml-1 text-[10px] text-white/70">R</kbd>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RecallModePage;
