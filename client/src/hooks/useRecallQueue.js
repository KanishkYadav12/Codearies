import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  useGetRecallQueueQuery,
  useRecallDropMutation
} from '../store/api/apiSlice';
import {
  completeRecall,
  endRecallSession,
  revealDrop,
  selectRecallSession,
  startRecallSession
} from '../store/slices/uiSlice';
import { pushToast } from '../store/slices/uiSlice';
import { MASTERY_THRESHOLD } from '../constants';

/**
 * Drives recall mode: the queue itself, which card is current, whether its
 * content is revealed, and the actions that advance the session.
 *
 * Combines two sources of truth deliberately:
 *   - **RTK Query** (`getRecallQueue`) — the actual due-for-review drops, kept
 *     fresh via cache invalidation whenever a recall happens anywhere in the app
 *   - **Redux `ui.recall`** — this browsing session's local progress (which
 *     cards are done, whether the current one is revealed), persisted to
 *     localStorage so a reload mid-session does not lose your place
 *
 * `completedIds` filters the server queue on the client rather than refetching
 * after every card: the queue can change size while you review (another drop
 * becomes due), and re-deriving from a stable list keeps the "3 of 7" counter
 * from jumping around mid-session.
 */
export function useRecallQueue() {
  const dispatch = useDispatch();
  const session = useSelector(selectRecallSession);

  const { data, isLoading, isFetching, error, refetch } = useGetRecallQueueQuery();
  const [recallDrop, { isLoading: isSubmitting }] = useRecallDropMutation();

  const allDue = data?.drops || [];
  const completedIds = session.completedIds || [];

  const remaining = useMemo(
    () => allDue.filter((drop) => !completedIds.includes(drop.id)),
    [allDue, completedIds]
  );

  const current = remaining[0] || null;
  const revealed = session.revealed;

  const totalToday = (data?.meta?.recalledToday || 0) + allDue.length;
  const doneToday = data?.meta?.recalledToday || 0;

  const begin = useCallback(() => {
    dispatch(startRecallSession());
  }, [dispatch]);

  const reveal = useCallback(() => {
    if (current && !revealed) {
      dispatch(revealDrop());
    }
  }, [dispatch, current, revealed]);

  /**
   * Submits the recall and advances the local session.
   *
   * The mastery celebration is decided here rather than trusted purely from the
   * server flag, so a network hiccup that loses the response does not also lose
   * the confetti moment — `recallCount` crossing 5 is visible in the mutation
   * result either way.
   */
  const answer = useCallback(
    (confidence) => {
      if (!current) {
        return Promise.resolve(null);
      }

      const dropId = current.id;

      return recallDrop({ id: dropId, confidence, recallType: 'scheduled' })
        .unwrap()
        .then((result) => {
          dispatch(completeRecall(dropId));

          if (result.justMastered || result.drop?.recallCount === MASTERY_THRESHOLD) {
            dispatch(
              pushToast(`Mastered "${result.drop.title}"! 🎉`, 'success', { duration: 4500 })
            );
          }

          return result;
        })
        .catch((submitError) => {
          dispatch(
            pushToast('Could not save that recall — please try again.', 'error')
          );
          throw submitError;
        });
    },
    [current, recallDrop, dispatch]
  );

  const remembered = useCallback((confidence = 4) => answer(confidence), [answer]);
  const needsReview = useCallback((confidence = 1) => answer(confidence), [answer]);

  const finish = useCallback(() => {
    dispatch(endRecallSession());
  }, [dispatch]);

  return {
    queue: remaining,
    current,
    revealed,
    isLoading,
    isFetching,
    isSubmitting,
    error,
    isEmpty: !isLoading && remaining.length === 0,
    progress: { done: doneToday, total: Math.max(totalToday, doneToday) },
    sessionActive: Boolean(session.sessionId),
    begin,
    reveal,
    remembered,
    needsReview,
    answer,
    finish,
    refetch
  };
}

export default useRecallQueue;
