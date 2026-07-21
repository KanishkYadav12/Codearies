'use strict';

/**
 * RecallHistory model — native MongoDB driver only.
 *
 * An append-only log of every recall event. The drop document carries the
 * *current* state (count, next date); this collection carries the *timeline*,
 * which is what the streak, the activity chart and the per-drop history read.
 *
 * Rows are written by dropModel.recallDrop inside the same transaction as the
 * counter update, so the log can never disagree with the drop.
 */

const connection = require('../db/connection');
const { toObjectId } = require('../utils/ids');
const { isIntegerBetween, LIMITS, RECALL_TYPES } = require('../utils/validators');

const { COLLECTIONS } = connection;

function recallHistory() {
  return connection.getCollection(COLLECTIONS.RECALL_HISTORY);
}

function toPublicEntry(document) {
  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    dropId: String(document.dropId),
    recalledAt: document.recalledAt,
    recallType: document.recallType,
    confidence: document.confidence === undefined ? null : document.confidence
  };
}

/**
 * Normalises a confidence rating to 1-5, or null when not supplied.
 * Recall mode makes the rating optional, so "no answer" must stay expressible.
 */
function normalizeConfidence(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  return isIntegerBetween(parsed, LIMITS.CONFIDENCE_MIN, LIMITS.CONFIDENCE_MAX) ? parsed : null;
}

function normalizeRecallType(value) {
  return RECALL_TYPES.indexOf(value) !== -1 ? value : 'manual';
}

/**
 * Direct insert. The normal path goes through dropModel.recallDrop (which
 * writes this row transactionally); this exists for the seed script.
 */
function record(entry, options) {
  return recallHistory().insertOne(
    {
      dropId: toObjectId(entry.dropId, 'dropId'),
      userId: toObjectId(entry.userId, 'userId'),
      recalledAt: entry.recalledAt instanceof Date ? entry.recalledAt : new Date(),
      recallType: normalizeRecallType(entry.recallType),
      confidence: normalizeConfidence(entry.confidence)
    },
    options || {}
  );
}

/** History for one drop, newest first — rendered on the detail page. */
function listForDrop(dropId, userId, limit) {
  return recallHistory()
    .find({
      dropId: toObjectId(dropId, 'dropId'),
      userId: toObjectId(userId, 'userId')
    })
    .sort({ recalledAt: -1 })
    .limit(Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100))
    .toArray()
    .then(function (documents) {
      return documents.map(toPublicEntry);
    });
}

/**
 * Recalls that happened today, used for the "3 of 7 drops recalled today"
 * progress indicator in recall mode.
 *
 * Counts *distinct drops*, not raw events: recalling the same drop twice should
 * not advance the progress bar twice.
 */
function countToday(userId, now) {
  const reference = now instanceof Date ? now : new Date();
  const startOfDay = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate()
  );

  return recallHistory()
    .aggregate([
      {
        $match: {
          userId: toObjectId(userId, 'userId'),
          recalledAt: { $gte: startOfDay }
        }
      },
      { $group: { _id: '$dropId' } },
      { $group: { _id: null, drops: { $sum: 1 } } }
    ])
    .toArray()
    .then(function (results) {
      return results.length ? results[0].drops : 0;
    });
}

/**
 * Daily recall counts over a window, oldest first — the dashboard activity
 * chart. Bucketing with `$dateToString` keeps the grouping in the database.
 */
function dailyActivity(userId, days) {
  const window = Math.min(Math.max(Number.parseInt(days, 10) || 30, 1), 365);
  const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000);

  return recallHistory()
    .aggregate([
      {
        $match: {
          userId: toObjectId(userId, 'userId'),
          recalledAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$recalledAt' } },
          recalls: { $sum: 1 },
          averageConfidence: { $avg: '$confidence' }
        }
      },
      { $sort: { _id: 1 } }
    ])
    .toArray()
    .then(function (documents) {
      return documents.map(function (entry) {
        return {
          date: entry._id,
          recalls: entry.recalls,
          averageConfidence: entry.averageConfidence
            ? Number(entry.averageConfidence.toFixed(2))
            : null
        };
      });
    });
}

/** Every recall timestamp for a user, newest first — input to the streak. */
function listRecallDates(userId, limit) {
  return recallHistory()
    .find(
      { userId: toObjectId(userId, 'userId') },
      { projection: { recalledAt: 1 }, sort: { recalledAt: -1 } }
    )
    .limit(limit || 1000)
    .toArray()
    .then(function (documents) {
      return documents.map(function (entry) {
        return entry.recalledAt;
      });
    });
}

function countForUser(userId) {
  return recallHistory().countDocuments({ userId: toObjectId(userId, 'userId') });
}

function deleteForDrop(dropId, options) {
  return recallHistory().deleteMany({ dropId: toObjectId(dropId, 'dropId') }, options || {});
}

module.exports = {
  record: record,
  listForDrop: listForDrop,
  listRecallDates: listRecallDates,
  countToday: countToday,
  countForUser: countForUser,
  dailyActivity: dailyActivity,
  deleteForDrop: deleteForDrop,
  toPublicEntry: toPublicEntry,
  normalizeConfidence: normalizeConfidence
};
