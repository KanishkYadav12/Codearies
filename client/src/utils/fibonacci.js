/**
 * Fibonacci / spaced-repetition helpers for the client.
 *
 * The server is the authority on scheduling — it computes and stores every
 * `nextRecallDate`. This module exists so the UI can *explain* that schedule
 * without a round trip: the "next review in 5h" hint on the recall button, the
 * interval ladder on the profile page, and the preview in the create form.
 *
 * The maths is duplicated deliberately and kept identical to
 * server/src/services/recallService.js. The alternative — an endpoint that
 * returns the next interval for a hypothetical recall — would be a network hop
 * to answer a question that is four lines of arithmetic.
 */

// Index 0 is unused padding so the sequence is 1-indexed: fib(1) = fib(2) = 1.
const cache = [0, 1, 1];

const MAX_INDEX = 70;

// The cadence the spec's interval ladder is defined against; see the server's
// recallService for the full explanation of the pace multiplier.
export const BASELINE_INTERVAL_HOURS = 24;

export const MASTERY_THRESHOLD = 5;

/** n-th Fibonacci number, 1-indexed and memoised. */
export function fibonacci(n) {
  const index = Number.isFinite(n) ? Math.floor(n) : 1;

  if (index < 1) {
    return 1;
  }

  const bounded = Math.min(index, MAX_INDEX);

  for (let i = cache.length; i <= bounded; i += 1) {
    cache[i] = cache[i - 1] + cache[i - 2];
  }

  return cache[bounded];
}

/** First `count` values of the sequence. */
export function sequence(count) {
  const values = [];

  for (let i = 1; i <= count; i += 1) {
    values.push(fibonacci(i));
  }

  return values;
}

/** The user's cadence preference expressed as a multiplier on the ladder. */
export function paceMultiplier(recallInterval) {
  const hours = Number(recallInterval);

  if (!Number.isFinite(hours) || hours <= 0) {
    return 1;
  }

  return hours / BASELINE_INTERVAL_HOURS;
}

/** Hours until the next review after `recallCount` successful recalls. */
export function intervalHoursFor(recallCount, recallInterval) {
  const count = Number.isFinite(recallCount) ? Math.max(0, Math.floor(recallCount)) : 0;
  return fibonacci(count + 1) * paceMultiplier(recallInterval);
}

/**
 * The upcoming ladder, for the profile page's schedule preview.
 * Returns `[{ step, fibonacci, intervalHours, label }]`.
 */
export function previewSchedule(steps = 8, recallInterval = BASELINE_INTERVAL_HOURS) {
  return sequence(steps).map((value, index) => {
    const step = index + 1;
    const intervalHours = intervalHoursFor(step, recallInterval);

    return {
      step,
      fibonacci: value,
      intervalHours,
      label: formatInterval(intervalHours)
    };
  });
}

/** Compact interval label: "45m", "3h", "2d 4h". */
export function formatInterval(hours) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'now';
  }

  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m`;
  }

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);

  return remainder ? `${days}d ${remainder}h` : `${days}d`;
}

/** How far along the mastery track a drop is, as a 0-1 fraction. */
export function masteryProgress(recallCount) {
  const count = Number.isFinite(recallCount) ? recallCount : 0;
  return Math.min(1, count / MASTERY_THRESHOLD);
}

export function isMastered(recallCount) {
  return Number.isFinite(recallCount) && recallCount >= MASTERY_THRESHOLD;
}
