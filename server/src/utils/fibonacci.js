'use strict';

/**
 * Fibonacci helpers for the spaced-repetition schedule.
 *
 * Backend constraint #6: the algorithm is implemented from scratch, no library.
 *
 * The sequence used by the spec is the 1-indexed "classic" form:
 *
 *   n     : 1  2  3  4  5  6   7   8   9   10
 *   fib(n): 1  1  2  3  5  8   13  21  34  55
 *
 * Values are memoised in a module-level cache. The sequence is only ever walked
 * forwards from the cache tail, so computing fib(n) is O(n) once and O(1) after.
 */

// Seeded so index 1 and 2 are both 1. Index 0 is unused padding.
const cache = [0, 1, 1];

// Above this the interval is longer than a human lifetime; clamping keeps the
// numbers inside Number.MAX_SAFE_INTEGER and keeps nextRecallDate a valid Date.
const MAX_INDEX = 70;

/**
 * Returns the n-th Fibonacci number (1-indexed).
 * Indices below 1 collapse to 1 so a fresh drop always gets the 1-hour interval.
 */
function fibonacci(n) {
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

/**
 * The first `count` values of the sequence — used by the UI to render the
 * upcoming interval ladder, and by the seed script.
 */
function sequence(count) {
  const values = [];
  for (let i = 1; i <= count; i += 1) {
    values.push(fibonacci(i));
  }
  return values;
}

module.exports = {
  fibonacci: fibonacci,
  sequence: sequence,
  MAX_INDEX: MAX_INDEX
};
