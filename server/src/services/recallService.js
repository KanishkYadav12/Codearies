'use strict';

/**
 * Spaced repetition scheduling — the core business logic of DevDrops.
 *
 * Implemented from scratch (backend constraint #6).
 *
 * ## The schedule
 *
 * The spec defines a Fibonacci ladder measured in hours:
 *
 *   on create      nextRecallDate = createdAt + 1 hour
 *   on recall #n   nextRecallDate = now + fib(n + 1) hours
 *
 * which produces the interval sequence 1h, 1h, 2h, 3h, 5h, 8h, 13h, 21h, 34h,
 * 55h ... Each successful recall pushes the drop further into the future, so
 * well-known material stops competing for attention with material you keep
 * forgetting.
 *
 * ## How `preferences.recallInterval` fits in
 *
 * The user schema carries `recallInterval` (hours, default 24) and the profile
 * page exposes it. We treat it as the user's *daily cadence*: the ladder above
 * is defined against the default 24, so
 *
 *   paceMultiplier = recallInterval / 24
 *
 * A user on the default 24 gets exactly the spec's ladder (multiplier 1.0). A
 * user who sets 48 reviews half as often (every interval doubles); one who sets
 * 12 reviews twice as often. The spec's algorithm is therefore the untouched
 * default behaviour, and the preference is a real, continuous control rather
 * than a stored-but-ignored field.
 */

const { fibonacci, sequence } = require('../utils/fibonacci');

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// The cadence the spec's interval ladder is defined against.
const BASELINE_INTERVAL_HOURS = 24;

// A drop recalled this many times counts as "mastered" (spec: recalled 5+).
const MASTERY_THRESHOLD = 5;

// Guard rails so a hostile or corrupted preference cannot push a review date
// past the end of the epoch.
const MIN_INTERVAL_HOURS = 1 / 60; // one minute
const MAX_INTERVAL_HOURS = 24 * 365 * 5; // five years

/**
 * Converts the stored preference into a multiplier on the ladder.
 * Falls back to 1.0 for missing or nonsensical values.
 */
function paceMultiplier(recallInterval) {
  const hours = Number(recallInterval);

  if (!Number.isFinite(hours) || hours <= 0) {
    return 1;
  }

  return hours / BASELINE_INTERVAL_HOURS;
}

/**
 * Hours to wait before the *next* review, given how many times a drop has
 * already been recalled.
 *
 * `recallCount` is the count *after* the recall being processed, matching the
 * spec's `recallCount++` then `fib(recallCount + 1)`.
 */
function intervalHoursFor(recallCount, recallInterval) {
  const count = Number.isFinite(recallCount) ? Math.max(0, Math.floor(recallCount)) : 0;
  const raw = fibonacci(count + 1) * paceMultiplier(recallInterval);

  return Math.min(Math.max(raw, MIN_INTERVAL_HOURS), MAX_INTERVAL_HOURS);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * MS_PER_HOUR);
}

/**
 * Schedule for a brand-new drop: one hour after creation, scaled by the user's
 * cadence. Deliberately short so a new drop surfaces in the recall queue while
 * it is still fresh enough to be worth reinforcing.
 */
function initialRecallDate(createdAt, recallInterval) {
  const from = createdAt instanceof Date ? createdAt : new Date(createdAt || Date.now());
  const hours = Math.min(
    Math.max(1 * paceMultiplier(recallInterval), MIN_INTERVAL_HOURS),
    MAX_INTERVAL_HOURS
  );

  return addHours(from, hours);
}

/**
 * Applies one recall event and returns the fields to persist.
 *
 * Confidence (1-5, self-reported in recall mode) modulates the result without
 * replacing the Fibonacci ladder:
 *
 *   confidence 1-2  the user did *not* really remember it. The ladder is walked
 *                   back one rung so the drop returns sooner. recallCount never
 *                   drops below zero, so a struggling drop stays near the start
 *                   of the ladder instead of drifting away.
 *   confidence 3    neutral — the plain spec behaviour.
 *   confidence 4-5  confident recall; the interval is stretched by 20% to avoid
 *                   wasting reviews on material that is clearly retained.
 *
 * Passing no confidence yields exactly the spec's algorithm.
 */
function applyRecall(options) {
  const settings = options || {};
  const now = settings.now instanceof Date ? settings.now : new Date();
  const previousCount = Number.isFinite(settings.recallCount)
    ? Math.max(0, Math.floor(settings.recallCount))
    : 0;
  const confidence = Number.isFinite(settings.confidence) ? settings.confidence : null;

  let nextCount = previousCount + 1;
  let stretch = 1;

  if (confidence !== null) {
    if (confidence <= 2) {
      // Step back down the ladder — but keep the credit for having reviewed it.
      nextCount = Math.max(0, previousCount);
    } else if (confidence >= 4) {
      stretch = 1.2;
    }
  }

  const hours = intervalHoursFor(nextCount, settings.recallInterval) * stretch;
  const bounded = Math.min(Math.max(hours, MIN_INTERVAL_HOURS), MAX_INTERVAL_HOURS);

  return {
    // The visible recall counter always advances: it records how many times the
    // user reviewed the drop, independent of how well it went.
    recallCount: previousCount + 1,
    // The scheduling position, which low confidence can hold back.
    scheduleStep: nextCount,
    lastRecalled: now,
    nextRecallDate: addHours(now, bounded),
    intervalHours: Number(bounded.toFixed(4)),
    // Crossing the threshold on *this* recall is what the UI celebrates.
    justMastered: previousCount + 1 === MASTERY_THRESHOLD
  };
}

function isMastered(recallCount) {
  return Number.isFinite(recallCount) && recallCount >= MASTERY_THRESHOLD;
}

/** A drop is due when its scheduled date has arrived. */
function isDue(drop, now) {
  if (!drop || !drop.nextRecallDate) {
    return false;
  }

  const reference = now instanceof Date ? now : new Date();
  const due = drop.nextRecallDate instanceof Date
    ? drop.nextRecallDate
    : new Date(drop.nextRecallDate);

  return due.getTime() <= reference.getTime();
}

/**
 * Current streak: consecutive calendar days ending today (or yesterday, if
 * today has no recall yet) on which at least one recall happened.
 *
 * Accepts the raw list of recall timestamps and buckets them by local day.
 * Allowing the streak to end "yesterday" means a user who has not reviewed yet
 * today still sees their streak, rather than watching it read zero until their
 * first recall of the day.
 */
function calculateStreak(recallDates, now) {
  if (!Array.isArray(recallDates) || !recallDates.length) {
    return 0;
  }

  const reference = now instanceof Date ? now : new Date();

  const dayKey = function (date) {
    const d = date instanceof Date ? date : new Date(date);
    // Normalise to local midnight; the numeric value is a stable day bucket.
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };

  const days = new Set();
  recallDates.forEach(function (date) {
    if (date) {
      days.add(dayKey(date));
    }
  });

  const today = dayKey(reference);
  const yesterday = today - MS_PER_DAY;

  // Anchor the walk on whichever of today/yesterday actually has a recall.
  let cursor;
  if (days.has(today)) {
    cursor = today;
  } else if (days.has(yesterday)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= MS_PER_DAY;
  }

  return streak;
}

/**
 * The upcoming interval ladder, for the profile page and the drop detail view.
 * Returns `[{ step, intervalHours, label }]`.
 */
function previewSchedule(steps, recallInterval) {
  const count = Number.isFinite(steps) ? steps : 8;

  return sequence(count).map(function (value, index) {
    const step = index + 1;
    const hours = intervalHoursFor(step, recallInterval);

    return {
      step: step,
      fibonacci: value,
      intervalHours: Number(hours.toFixed(2)),
      label: formatInterval(hours)
    };
  });
}

/** Human-friendly interval string: "45m", "3h", "2d 4h". */
function formatInterval(hours) {
  if (hours < 1) {
    return Math.round(hours * 60) + 'm';
  }

  if (hours < 24) {
    return Math.round(hours) + 'h';
  }

  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours % 24);

  return remainder ? days + 'd ' + remainder + 'h' : days + 'd';
}

module.exports = {
  applyRecall: applyRecall,
  initialRecallDate: initialRecallDate,
  intervalHoursFor: intervalHoursFor,
  calculateStreak: calculateStreak,
  previewSchedule: previewSchedule,
  formatInterval: formatInterval,
  isDue: isDue,
  isMastered: isMastered,
  paceMultiplier: paceMultiplier,
  MASTERY_THRESHOLD: MASTERY_THRESHOLD,
  BASELINE_INTERVAL_HOURS: BASELINE_INTERVAL_HOURS,
  MS_PER_HOUR: MS_PER_HOUR
};
