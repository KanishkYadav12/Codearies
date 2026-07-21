'use strict';

/**
 * Manual index + view creation (database constraints #1 and #4).
 *
 * Nothing here is implicit: every index is declared with an explicit name and a
 * comment explaining the query it exists to serve. Run with `npm run indexes`.
 * The script is idempotent — re-running it against a provisioned database is a
 * no-op, which makes it safe to call from a deploy hook.
 */

const connection = require('./connection');
const logger = require('../utils/logger').child('indexes');

const { COLLECTIONS, DROP_STATS_VIEW } = connection;

/**
 * Every index the application depends on, grouped by collection.
 *
 * `keys` maps to the MongoDB index specification; `options` carries uniqueness,
 * partial filters and the index name. The `why` field is documentation only.
 */
const INDEX_PLAN = [
  {
    collection: COLLECTIONS.USERS,
    indexes: [
      {
        keys: { username: 1 },
        options: { name: 'uniq_username', unique: true },
        why: 'Registration uniqueness check and username lookups.'
      },
      {
        keys: { email: 1 },
        options: { name: 'uniq_email', unique: true },
        why: 'Login is by email; must be unique and instant.'
      }
    ]
  },

  {
    collection: COLLECTIONS.DROPS,
    indexes: [
      {
        keys: { createdBy: 1, createdAt: -1 },
        options: { name: 'owner_recent' },
        why: 'Default "my drops", newest first, and the dashboard recent list.'
      },
      {
        keys: { createdBy: 1, nextRecallDate: 1 },
        options: { name: 'owner_recall_queue' },
        why: 'The recall queue: drops for a user whose nextRecallDate has passed.'
      },
      {
        keys: { createdBy: 1, type: 1, createdAt: -1 },
        options: { name: 'owner_type_recent' },
        why: 'Explorer filter by type, still sorted by recency.'
      },
      {
        keys: { createdBy: 1, tags: 1 },
        options: { name: 'owner_tags' },
        why: 'Multikey index powering tag filtering and related-drop discovery.'
      },
      {
        keys: { createdBy: 1, isFavorite: 1, createdAt: -1 },
        options: {
          name: 'owner_favorites',
          // Only index the documents the favourites tab actually reads.
          partialFilterExpression: { isFavorite: true }
        },
        why: 'Favourites tab; partial so the index stays small.'
      },
      {
        keys: { createdBy: 1, recallCount: -1 },
        options: { name: 'owner_most_recalled' },
        why: 'The "Most Recalled" sort option and the mastered-drops stat.'
      },
      {
        keys: { visibility: 1, createdAt: -1 },
        options: {
          name: 'public_explore',
          partialFilterExpression: { visibility: 'public' }
        },
        why: 'Unauthenticated /api/public/explore feed.'
      },
      {
        keys: { title: 'text', content: 'text', tags: 'text' },
        options: {
          name: 'drop_fulltext',
          // Title matches should outrank a passing mention in the body.
          weights: { title: 10, tags: 5, content: 1 },
          default_language: 'english',
          // A drop stores its *programming* language in `language`, which is
          // also the field name MongoDB reserves for a per-document text
          // language override. Left at the default, a drop with
          // `language: null` (or "javascript") is rejected on insert. Point
          // the override at a field we never write so the two never collide.
          language_override: 'textSearchLanguage'
        },
        why: 'Search bar across title, content and tags.'
      },
      {
        keys: { relatedDrops: 1 },
        options: { name: 'related_backrefs' },
        why: 'Cleaning up back-references when a drop is deleted.'
      }
    ]
  },

  {
    collection: COLLECTIONS.COLLECTIONS,
    indexes: [
      {
        keys: { createdBy: 1, name: 1 },
        options: { name: 'uniq_collection_name_per_user', unique: true },
        why: 'Schema requires collection names to be unique per user.'
      },
      {
        keys: { shareToken: 1 },
        options: {
          name: 'uniq_share_token',
          unique: true,
          // Only shared collections carry a token; unique + sparse would still
          // collide on repeated nulls, so filter on existence instead.
          partialFilterExpression: { shareToken: { $type: 'string' } }
        },
        why: 'Public share lookups by token, and token collision safety.'
      },
      {
        keys: { createdBy: 1, createdAt: -1 },
        options: { name: 'owner_collections_recent' },
        why: 'Collections page listing.'
      }
    ]
  },

  {
    collection: COLLECTIONS.RECALL_HISTORY,
    indexes: [
      {
        keys: { userId: 1, recalledAt: -1 },
        options: { name: 'user_recall_timeline' },
        why: 'Streak calculation walks a user\'s recalls newest-first.'
      },
      {
        keys: { dropId: 1, recalledAt: -1 },
        options: { name: 'drop_recall_timeline' },
        why: 'Per-drop history on the detail page, and cascade delete.'
      }
    ]
  }
];

/**
 * Aggregation-backed view for per-user drop statistics (database constraint #4).
 *
 * Reading `dropStatsView` gives one document per user with the four dashboard
 * numbers pre-computed. `$$NOW` is evaluated per query, so "pending" stays
 * correct without the view ever being refreshed.
 *
 * Note: the streak is *not* here — it depends on recallHistory day-bucketing and
 * is computed in dropModel via its own pipeline.
 */
const DROP_STATS_PIPELINE = [
  {
    $group: {
      _id: '$createdBy',
      totalDrops: { $sum: 1 },
      masteredDrops: {
        // "Mastered" is defined by the spec as recalled 5 or more times.
        $sum: { $cond: [{ $gte: ['$recallCount', 5] }, 1, 0] }
      },
      pendingDrops: {
        $sum: {
          $cond: [
            {
              $and: [
                { $ne: ['$nextRecallDate', null] },
                { $lte: ['$nextRecallDate', '$$NOW'] }
              ]
            },
            1,
            0
          ]
        }
      },
      favoriteDrops: {
        $sum: { $cond: [{ $eq: ['$isFavorite', true] }, 1, 0] }
      },
      publicDrops: {
        $sum: { $cond: [{ $eq: ['$visibility', 'public'] }, 1, 0] }
      },
      totalRecalls: { $sum: '$recallCount' }
    }
  },
  {
    $project: {
      _id: 0,
      userId: '$_id',
      totalDrops: 1,
      masteredDrops: 1,
      pendingDrops: 1,
      favoriteDrops: 1,
      publicDrops: 1,
      totalRecalls: 1
    }
  }
];

function createIndexes() {
  const db = connection.getDb();

  // Flatten the plan so every index is one entry in a sequential chain. Running
  // them in series keeps the log readable and avoids hammering a shared tier.
  const jobs = [];

  INDEX_PLAN.forEach(function (group) {
    group.indexes.forEach(function (definition) {
      jobs.push({ collection: group.collection, definition: definition });
    });
  });

  return jobs
    .reduce(function (chain, job) {
      return chain.then(function () {
        return db
          .collection(job.collection)
          .createIndex(job.definition.keys, job.definition.options)
          .then(function (name) {
            logger.info('Index ready', { collection: job.collection, index: name });
          })
          .catch(function (error) {
            // An index that already exists with different options throws
            // IndexOptionsConflict (85) / IndexKeySpecsConflict (86). The old
            // definition is the stale one, so drop it and rebuild rather than
            // leaving the database on a spec the application no longer expects
            // — a conflicting text index, for example, rejects every insert.
            if (error.code !== 85 && error.code !== 86) {
              throw error;
            }

            logger.warn('Index definition changed, rebuilding', {
              collection: job.collection,
              index: job.definition.options.name
            });

            return db
              .collection(job.collection)
              .dropIndex(job.definition.options.name)
              .catch(function (dropError) {
                // 27 == IndexNotFound: the conflict was on the key pattern
                // under a different name, so fall back to matching by keys.
                if (dropError.code !== 27) {
                  throw dropError;
                }
                return db.collection(job.collection).dropIndex(job.definition.keys);
              })
              .then(function () {
                return db
                  .collection(job.collection)
                  .createIndex(job.definition.keys, job.definition.options);
              })
              .then(function (name) {
                logger.info('Index rebuilt', { collection: job.collection, index: name });
              });
          });
      });
    }, Promise.resolve())
    .then(function () {
      logger.info('All indexes created', { count: jobs.length });
    });
}

function createDropStatsView() {
  const db = connection.getDb();

  return db
    .createCollection(DROP_STATS_VIEW, {
      viewOn: COLLECTIONS.DROPS,
      pipeline: DROP_STATS_PIPELINE
    })
    .then(function () {
      logger.info('Created view', { view: DROP_STATS_VIEW });
    })
    .catch(function (error) {
      // 48 == NamespaceExists. The view is already there; recreate it so a
      // changed pipeline actually takes effect.
      if (error.code !== 48) {
        throw error;
      }

      return db
        .command({
          collMod: DROP_STATS_VIEW,
          viewOn: COLLECTIONS.DROPS,
          pipeline: DROP_STATS_PIPELINE
        })
        .then(function () {
          logger.info('Updated existing view', { view: DROP_STATS_VIEW });
        });
    });
}

function syncSchema() {
  return createIndexes().then(createDropStatsView);
}

// Allow both `require()` from the app and `node src/db/indexes.js` from a shell.
if (require.main === module) {
  connection
    .connect()
    .then(syncSchema)
    .then(function () {
      logger.info('Schema sync complete');
      return connection.close();
    })
    .then(function () {
      process.exit(0);
    })
    .catch(function (error) {
      logger.error('Schema sync failed', error);
      process.exit(1);
    });
}

module.exports = {
  syncSchema: syncSchema,
  createIndexes: createIndexes,
  createDropStatsView: createDropStatsView,
  INDEX_PLAN: INDEX_PLAN,
  DROP_STATS_PIPELINE: DROP_STATS_PIPELINE
};
