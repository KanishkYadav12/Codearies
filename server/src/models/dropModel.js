'use strict';

/**
 * Drop model — the main entity. Native MongoDB driver only.
 *
 * Owns the document shape, the recall scheduling writes, the related-drop
 * graph, and the aggregation pipelines behind the statistics endpoints.
 */

const connection = require('../db/connection');
const ApiError = require('../utils/ApiError');
const recallService = require('../services/recallService');
const tagService = require('../services/tagService');
const searchService = require('../services/searchService');
const { toObjectId, toObjectIdList, uniqueObjectIds, sameId } = require('../utils/ids');
const {
  validateDropFields,
  normalizeText,
  normalizeTags,
  LIMITS
} = require('../utils/validators');

const { COLLECTIONS, DROP_STATS_VIEW } = connection;

function drops() {
  return connection.getCollection(COLLECTIONS.DROPS);
}

function collections() {
  return connection.getCollection(COLLECTIONS.COLLECTIONS);
}

function recallHistory() {
  return connection.getCollection(COLLECTIONS.RECALL_HISTORY);
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Shapes a raw document for the API. Dates stay as Date objects — Express's
 * JSON serialiser renders them as ISO strings, which the client parses.
 */
function toPublicDrop(document, viewerId) {
  if (!document) {
    return null;
  }

  const owner = document.createdBy;

  return {
    id: String(document._id),
    title: document.title,
    content: document.content,
    type: document.type,
    language: document.language || null,
    tags: document.tags || [],
    visibility: document.visibility,
    createdBy: owner ? String(owner) : null,
    // Populated by aggregation on the public feed; absent elsewhere.
    author: document.author || null,
    isFavorite: Boolean(document.isFavorite),
    recallCount: document.recallCount || 0,
    lastRecalled: document.lastRecalled || null,
    nextRecallDate: document.nextRecallDate || null,
    relatedDrops: (document.relatedDrops || []).map(String),
    isDue: recallService.isDue(document),
    isMastered: recallService.isMastered(document.recallCount || 0),
    isOwner: viewerId ? sameId(owner, viewerId) : false,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function toPublicDrops(documents, viewerId) {
  return (documents || []).map(function (document) {
    return toPublicDrop(document, viewerId);
  });
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

/**
 * Creates a drop.
 *
 * Auto-categorisation runs first (type / language / tags), then the initial
 * recall date is scheduled from the user's cadence preference. Related drops
 * are suggested — but not linked — so the user stays in control of the graph.
 */
function createDrop(fields, context) {
  const problems = validateDropFields(fields);

  if (problems.length) {
    return Promise.reject(ApiError.unprocessable('Invalid drop', problems));
  }

  const ownerId = toObjectId(context.userId, 'userId');
  const preferences = context.preferences || {};
  const enriched = tagService.enrich(fields);
  const now = new Date();

  const visibility =
    fields.visibility || preferences.defaultVisibility || 'private';

  const document = {
    title: normalizeText(fields.title).slice(0, LIMITS.DROP_TITLE_MAX),
    content: fields.content,
    type: enriched.type,
    language: enriched.language,
    tags: enriched.tags,
    visibility: visibility,
    createdBy: ownerId,
    isFavorite: Boolean(fields.isFavorite),
    recallCount: 0,
    // Mirrors recallCount unless low-confidence recalls hold it back; see
    // recallService.applyRecall.
    scheduleStep: 0,
    lastRecalled: null,
    nextRecallDate: recallService.initialRecallDate(now, preferences.recallInterval),
    relatedDrops: toObjectIdList(fields.relatedDrops),
    createdAt: now,
    updatedAt: now
  };

  return drops()
    .insertOne(document)
    .then(function (result) {
      document._id = result.insertedId;

      // Suggestions are advisory; a failure here must not fail the create.
      return suggestRelated(document)
        .catch(function () {
          return [];
        })
        .then(function (suggestions) {
          const drop = toPublicDrop(document, ownerId);
          drop.autoDetected = enriched.autoDetected;
          drop.suggestedRelated = suggestions;
          return drop;
        });
    });
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

function findRawById(dropId) {
  return drops().findOne({ _id: toObjectId(dropId, 'dropId') });
}

/**
 * Fetches a drop the viewer is allowed to see: their own, or anyone's public
 * drop. Returns null when it does not exist; throws 403 when it exists but is
 * private and owned by someone else.
 */
function findAccessible(dropId, viewerId) {
  return findRawById(dropId).then(function (document) {
    if (!document) {
      return null;
    }

    const isOwner = viewerId && sameId(document.createdBy, viewerId);

    if (!isOwner && document.visibility !== 'public') {
      throw ApiError.forbidden('This drop is private');
    }

    return document;
  });
}

/**
 * Paginated listing for the explorer and "my drops".
 *
 * When a collection filter is present we resolve the collection's drop ids
 * first and fold them into the `_id` clause, rather than joining — the
 * membership list already lives on the collection document.
 */
function listForUser(query, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const pagination = searchService.buildPagination(query);
  const sort = searchService.buildSort(query.sort);

  return Promise.resolve()
    .then(function () {
      const filter = searchService.buildDropFilter(query, { owner: ownerId });

      if (!filter.__collectionId) {
        return filter;
      }

      const collectionId = filter.__collectionId;
      delete filter.__collectionId;

      return collections()
        .findOne(
          { _id: collectionId, createdBy: ownerId },
          { projection: { drops: 1 } }
        )
        .then(function (found) {
          if (!found) {
            throw ApiError.notFound('Collection not found');
          }
          filter._id = { $in: found.drops || [] };
          return filter;
        });
    })
    .then(function (filter) {
      return Promise.all([
        drops()
          .find(filter)
          .sort(sort)
          .skip(pagination.skip)
          .limit(pagination.limit)
          .toArray(),
        drops().countDocuments(filter)
      ]).then(function (results) {
        return {
          drops: toPublicDrops(results[0], ownerId),
          pagination: searchService.buildPageMeta(results[1], pagination)
        };
      });
    });
}

/**
 * The recall queue: drops whose scheduled date has passed, soonest-overdue
 * first so the longest-neglected material surfaces at the top.
 */
function listDue(context, limit) {
  const ownerId = toObjectId(context.userId, 'userId');
  const cap = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 50);

  const filter = {
    createdBy: ownerId,
    nextRecallDate: { $lte: new Date() }
  };

  return Promise.all([
    drops().find(filter).sort({ nextRecallDate: 1 }).limit(cap).toArray(),
    drops().countDocuments(filter)
  ]).then(function (results) {
    return {
      drops: toPublicDrops(results[0], ownerId),
      total: results[1]
    };
  });
}

function listRecent(userId, limit) {
  const ownerId = toObjectId(userId, 'userId');

  return drops()
    .find({ createdBy: ownerId })
    .sort({ updatedAt: -1 })
    .limit(limit || 5)
    .toArray()
    .then(function (documents) {
      return toPublicDrops(documents, ownerId);
    });
}

/**
 * Public feed. Uses `$lookup` + `$unwind` to attach the author's username so
 * the client can render attribution in one round trip.
 */
function listPublic(query) {
  const pagination = searchService.buildPagination(query);
  const sort = searchService.buildSort(query.sort);
  const filter = searchService.buildDropFilter(query, { publicOnly: true });

  delete filter.__collectionId;

  const pipeline = [
    { $match: filter },
    { $sort: sort },
    { $skip: pagination.skip },
    { $limit: pagination.limit },
    {
      $lookup: {
        from: COLLECTIONS.USERS,
        localField: 'createdBy',
        foreignField: '_id',
        as: 'authorDocs'
      }
    },
    // preserveNull keeps a drop visible even if its author row vanished.
    { $unwind: { path: '$authorDocs', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        author: {
          id: { $toString: '$authorDocs._id' },
          username: '$authorDocs.username'
        }
      }
    },
    { $project: { authorDocs: 0 } }
  ];

  return Promise.all([
    drops().aggregate(pipeline).toArray(),
    drops().countDocuments(filter)
  ]).then(function (results) {
    return {
      drops: toPublicDrops(results[0], null),
      pagination: searchService.buildPageMeta(results[1], pagination)
    };
  });
}

/* ------------------------------------------------------------------ */
/* Update                                                              */
/* ------------------------------------------------------------------ */

/**
 * Partial update. Ownership is enforced by the route middleware; the filter
 * still pins `createdBy` as a second line of defence.
 */
function updateDrop(dropId, fields, context) {
  const problems = validateDropFields(fields, { partial: true });

  if (problems.length) {
    return Promise.reject(ApiError.unprocessable('Invalid drop update', problems));
  }

  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(dropId, 'dropId');
  const updates = { updatedAt: new Date() };

  if (fields.title !== undefined) {
    updates.title = normalizeText(fields.title).slice(0, LIMITS.DROP_TITLE_MAX);
  }

  if (fields.content !== undefined) {
    updates.content = fields.content;

    // Re-derive anything the user did not pin explicitly, so an edited drop
    // does not keep a stale type or language badge.
    if (fields.type === undefined) {
      updates.type = tagService.detectType(fields.content);
    }
    if (fields.language === undefined) {
      const detectedType = updates.type || fields.type;
      updates.language =
        detectedType === 'code' ? tagService.detectLanguage(fields.content) : null;
    }
  }

  if (fields.type !== undefined) {
    updates.type = fields.type;
  }

  if (fields.language !== undefined) {
    updates.language = fields.language || null;
  }

  if (fields.tags !== undefined) {
    updates.tags = normalizeTags(fields.tags);
  }

  if (fields.visibility !== undefined) {
    updates.visibility = fields.visibility;
  }

  if (fields.isFavorite !== undefined) {
    updates.isFavorite = Boolean(fields.isFavorite);
  }

  if (Object.keys(updates).length === 1) {
    return Promise.reject(ApiError.badRequest('No changes supplied'));
  }

  return drops()
    .findOneAndUpdate({ _id: id, createdBy: ownerId }, { $set: updates }, {
      returnDocument: 'after'
    })
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('Drop not found');
      }

      return toPublicDrop(document, ownerId);
    });
}

/** Flips the favourite flag and returns the new state. */
function toggleFavorite(dropId, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(dropId, 'dropId');

  return drops()
    .findOneAndUpdate(
      { _id: id, createdBy: ownerId },
      // $not on a boolean field flips it server-side, avoiding a read-modify-
      // write race between two tabs.
      [{ $set: { isFavorite: { $not: '$isFavorite' }, updatedAt: '$$NOW' } }],
      { returnDocument: 'after' }
    )
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('Drop not found');
      }

      return toPublicDrop(document, ownerId);
    });
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

/**
 * Deletes a drop and every reference to it (database constraint #3).
 *
 * Four writes must succeed or fail together:
 *   1. the drop itself
 *   2. its recall history
 *   3. its membership in any collection
 *   4. back-references from other drops' relatedDrops arrays
 *
 * Leaving any of these behind produces dangling ids that surface as broken
 * cards in the UI, so they run inside a transaction where the deployment
 * supports one.
 */
function deleteDrop(dropId, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(dropId, 'dropId');

  return connection.withTransaction(function (session) {
    const options = session ? { session: session } : {};

    return drops()
      .deleteOne({ _id: id, createdBy: ownerId }, options)
      .then(function (result) {
        if (!result.deletedCount) {
          throw ApiError.notFound('Drop not found');
        }

        return Promise.all([
          recallHistory().deleteMany({ dropId: id }, options),
          collections().updateMany(
            { createdBy: ownerId, drops: id },
            { $pull: { drops: id } },
            options
          ),
          drops().updateMany(
            { createdBy: ownerId, relatedDrops: id },
            { $pull: { relatedDrops: id } },
            options
          )
        ]);
      })
      .then(function (results) {
        return {
          deleted: true,
          id: String(id),
          recallHistoryRemoved: results[0].deletedCount,
          collectionsUpdated: results[1].modifiedCount,
          backReferencesRemoved: results[2].modifiedCount
        };
      });
  });
}

/**
 * Bulk operations from the "my drops" multi-select toolbar.
 * Also transactional: a half-applied bulk action is worse than none.
 */
function bulkAction(dropIds, action, payload, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const ids = uniqueObjectIds(toObjectIdList(dropIds));

  if (!ids.length) {
    return Promise.reject(ApiError.badRequest('No valid drop ids supplied'));
  }

  if (ids.length > 100) {
    return Promise.reject(ApiError.badRequest('Bulk actions are limited to 100 drops'));
  }

  const filter = { _id: { $in: ids }, createdBy: ownerId };

  return connection.withTransaction(function (session) {
    const options = session ? { session: session } : {};

    if (action === 'delete') {
      return drops()
        .deleteMany(filter, options)
        .then(function (result) {
          return Promise.all([
            recallHistory().deleteMany({ dropId: { $in: ids } }, options),
            collections().updateMany(
              { createdBy: ownerId, drops: { $in: ids } },
              { $pull: { drops: { $in: ids } } },
              options
            ),
            drops().updateMany(
              { createdBy: ownerId, relatedDrops: { $in: ids } },
              { $pull: { relatedDrops: { $in: ids } } },
              options
            )
          ]).then(function () {
            return { action: action, affected: result.deletedCount };
          });
        });
    }

    if (action === 'visibility') {
      const visibility = payload && payload.visibility;

      if (visibility !== 'public' && visibility !== 'private') {
        throw ApiError.badRequest('visibility must be public or private');
      }

      return drops()
        .updateMany(filter, { $set: { visibility: visibility, updatedAt: new Date() } }, options)
        .then(function (result) {
          return { action: action, affected: result.modifiedCount };
        });
    }

    if (action === 'favorite') {
      const isFavorite = Boolean(payload && payload.isFavorite);

      return drops()
        .updateMany(filter, { $set: { isFavorite: isFavorite, updatedAt: new Date() } }, options)
        .then(function (result) {
          return { action: action, affected: result.modifiedCount };
        });
    }

    if (action === 'collection') {
      const collectionId = toObjectId(payload && payload.collectionId, 'collectionId');

      // Verify ownership of the target collection *inside* the transaction, so
      // the membership write and the check see the same snapshot.
      return collections()
        .findOne({ _id: collectionId, createdBy: ownerId }, options)
        .then(function (found) {
          if (!found) {
            throw ApiError.notFound('Collection not found');
          }

          return drops()
            .find(filter, Object.assign({ projection: { _id: 1 } }, options))
            .toArray();
        })
        .then(function (owned) {
          const ownedIds = owned.map(function (item) {
            return item._id;
          });

          return collections()
            .updateOne(
              { _id: collectionId, createdBy: ownerId },
              { $addToSet: { drops: { $each: ownedIds } } },
              options
            )
            .then(function () {
              return { action: action, affected: ownedIds.length };
            });
        });
    }

    throw ApiError.badRequest('Unsupported bulk action: ' + action);
  });
}

/* ------------------------------------------------------------------ */
/* Recall                                                              */
/* ------------------------------------------------------------------ */

/**
 * Records a recall event and reschedules the drop.
 *
 * Writes to two collections (the drop's counters, and an immutable history
 * row), so it runs transactionally where supported — a recall that bumped the
 * counter but lost its history row would corrupt the streak calculation.
 */
function recallDrop(dropId, options, context) {
  const settings = options || {};
  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(dropId, 'dropId');
  const preferences = context.preferences || {};

  return drops()
    .findOne({ _id: id, createdBy: ownerId })
    .then(function (document) {
      if (!document) {
        throw ApiError.notFound('Drop not found');
      }

      const outcome = recallService.applyRecall({
        recallCount: document.recallCount || 0,
        confidence: settings.confidence,
        recallInterval: preferences.recallInterval,
        now: new Date()
      });

      return connection.withTransaction(function (session) {
        const sessionOptions = session ? { session: session } : {};

        return drops()
          .findOneAndUpdate(
            { _id: id, createdBy: ownerId },
            {
              $set: {
                recallCount: outcome.recallCount,
                scheduleStep: outcome.scheduleStep,
                lastRecalled: outcome.lastRecalled,
                nextRecallDate: outcome.nextRecallDate,
                updatedAt: outcome.lastRecalled
              }
            },
            Object.assign({ returnDocument: 'after' }, sessionOptions)
          )
          .then(function (result) {
            const updated = result && result.value ? result.value : result;

            if (!updated) {
              throw ApiError.notFound('Drop not found');
            }

            return recallHistory()
              .insertOne(
                {
                  dropId: id,
                  userId: ownerId,
                  recalledAt: outcome.lastRecalled,
                  recallType: settings.recallType === 'scheduled' ? 'scheduled' : 'manual',
                  confidence: Number.isFinite(settings.confidence) ? settings.confidence : null
                },
                sessionOptions
              )
              .then(function () {
                const drop = toPublicDrop(updated, ownerId);

                return {
                  drop: drop,
                  intervalHours: outcome.intervalHours,
                  intervalLabel: recallService.formatInterval(outcome.intervalHours),
                  // Drives the confetti celebration on the client.
                  justMastered: outcome.justMastered
                };
              });
          });
      });
    });
}

/* ------------------------------------------------------------------ */
/* Related drops                                                       */
/* ------------------------------------------------------------------ */

/** Scored suggestions, excluding drops already linked. */
function suggestRelated(drop, limit) {
  const pipeline = searchService.buildRelatedPipeline(drop, { limit: limit || 5 });

  return drops()
    .aggregate(pipeline)
    .toArray()
    .then(function (documents) {
      const linked = new Set((drop.relatedDrops || []).map(String));

      return documents
        .filter(function (candidate) {
          return !linked.has(String(candidate._id));
        })
        .map(function (candidate) {
          return {
            id: String(candidate._id),
            title: candidate.title,
            type: candidate.type,
            language: candidate.language || null,
            tags: candidate.tags || [],
            relevance: candidate.relevance,
            sharedTags: candidate.sharedTags
          };
        });
    });
}

/**
 * Everything related to a drop: the explicit links, plus fresh suggestions.
 * `$lookup` resolves the manual links in one round trip.
 */
function getRelated(dropId, viewerId) {
  const id = toObjectId(dropId, 'dropId');

  return findAccessible(id, viewerId).then(function (document) {
    if (!document) {
      throw ApiError.notFound('Drop not found');
    }

    const pipeline = [
      { $match: { _id: id } },
      {
        $lookup: {
          from: COLLECTIONS.DROPS,
          localField: 'relatedDrops',
          foreignField: '_id',
          as: 'linked'
        }
      },
      { $unwind: { path: '$linked', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$_id',
          linked: {
            // $unwind on an empty array with preserveNull yields a missing
            // field; $ifNull keeps those out of the regrouped list.
            $push: {
              $cond: [{ $ifNull: ['$linked._id', false] }, '$linked', '$$REMOVE']
            }
          }
        }
      }
    ];

    return drops()
      .aggregate(pipeline)
      .toArray()
      .then(function (results) {
        const linked = results.length ? results[0].linked || [] : [];

        // Suggestions only make sense for the owner — they would otherwise leak
        // the titles of that user's private drops.
        const isOwner = viewerId && sameId(document.createdBy, viewerId);

        if (!isOwner) {
          return { related: toPublicDrops(linked, viewerId), suggested: [] };
        }

        return suggestRelated(document).then(function (suggested) {
          return { related: toPublicDrops(linked, viewerId), suggested: suggested };
        });
      });
  });
}

/**
 * Links two drops *bidirectionally*, as the spec requires: a relationship the
 * user can only see from one side is a bug waiting to be reported.
 */
function relateDrops(dropId, targetId, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const source = toObjectId(dropId, 'dropId');
  const target = toObjectId(targetId, 'relatedDropId');

  if (sameId(source, target)) {
    return Promise.reject(ApiError.badRequest('A drop cannot be related to itself'));
  }

  return drops()
    .find({ _id: { $in: [source, target] }, createdBy: ownerId })
    .toArray()
    .then(function (found) {
      if (found.length !== 2) {
        throw ApiError.notFound('Both drops must exist and belong to you');
      }

      return connection.withTransaction(function (session) {
        const options = session ? { session: session } : {};
        const now = new Date();

        return Promise.all([
          drops().updateOne(
            { _id: source },
            { $addToSet: { relatedDrops: target }, $set: { updatedAt: now } },
            options
          ),
          drops().updateOne(
            { _id: target },
            { $addToSet: { relatedDrops: source }, $set: { updatedAt: now } },
            options
          )
        ]);
      });
    })
    .then(function () {
      return drops().findOne({ _id: source });
    })
    .then(function (document) {
      return toPublicDrop(document, ownerId);
    });
}

/** Removes the link from both sides. */
function unrelateDrops(dropId, targetId, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const source = toObjectId(dropId, 'dropId');
  const target = toObjectId(targetId, 'relatedDropId');

  return connection
    .withTransaction(function (session) {
      const options = session ? { session: session } : {};
      const now = new Date();

      return Promise.all([
        drops().updateOne(
          { _id: source, createdBy: ownerId },
          { $pull: { relatedDrops: target }, $set: { updatedAt: now } },
          options
        ),
        drops().updateOne(
          { _id: target, createdBy: ownerId },
          { $pull: { relatedDrops: source }, $set: { updatedAt: now } },
          options
        )
      ]);
    })
    .then(function () {
      return drops().findOne({ _id: source, createdBy: ownerId });
    })
    .then(function (document) {
      if (!document) {
        throw ApiError.notFound('Drop not found');
      }
      return toPublicDrop(document, ownerId);
    });
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

/**
 * Dashboard statistics.
 *
 * Reads the counts from `dropStatsView` (the aggregation view created in
 * db/indexes.js) and computes the streak from recallHistory with a separate
 * `$group` that buckets recalls into calendar days.
 */
function getStats(userId) {
  const ownerId = toObjectId(userId, 'userId');

  const viewQuery = connection
    .getDb()
    .collection(DROP_STATS_VIEW)
    .findOne({ userId: ownerId })
    .catch(function () {
      // If the view is missing (fresh database, indexes not yet run) fall back
      // to computing the same numbers inline rather than failing the dashboard.
      return null;
    });

  const streakQuery = recallHistory()
    .aggregate([
      { $match: { userId: ownerId } },
      {
        $group: {
          // One bucket per calendar day, in UTC.
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$recalledAt' }
          },
          recalls: { $sum: 1 },
          lastAt: { $max: '$recalledAt' }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 400 }
    ])
    .toArray();

  const typeBreakdown = drops()
    .aggregate([
      { $match: { createdBy: ownerId } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    .toArray();

  const collectionCount = collections().countDocuments({ createdBy: ownerId });

  return Promise.all([viewQuery, streakQuery, typeBreakdown, collectionCount, fallbackCounts(ownerId)])
    .then(function (results) {
      const view = results[0];
      const days = results[1];
      const byType = results[2];
      const totalCollections = results[3];
      const fallback = results[4];

      const counts = view || fallback;

      const streak = recallService.calculateStreak(
        days.map(function (day) {
          return day.lastAt;
        })
      );

      const totalRecalls = days.reduce(function (sum, day) {
        return sum + day.recalls;
      }, 0);

      return {
        totalDrops: counts.totalDrops || 0,
        masteredDrops: counts.masteredDrops || 0,
        pendingDrops: counts.pendingDrops || 0,
        favoriteDrops: counts.favoriteDrops || 0,
        publicDrops: counts.publicDrops || 0,
        totalCollections: totalCollections,
        totalRecalls: totalRecalls,
        currentStreak: streak,
        activeDays: days.length,
        byType: byType.map(function (entry) {
          return { type: entry._id, count: entry.count };
        }),
        // Sparkline data for the dashboard, oldest first.
        recentActivity: days
          .slice(0, 30)
          .reverse()
          .map(function (day) {
            return { date: day._id, recalls: day.recalls };
          })
      };
    });
}

/** Same numbers as dropStatsView, computed inline when the view is absent. */
function fallbackCounts(ownerId) {
  return drops()
    .aggregate([
      { $match: { createdBy: ownerId } },
      {
        $group: {
          _id: null,
          totalDrops: { $sum: 1 },
          masteredDrops: { $sum: { $cond: [{ $gte: ['$recallCount', 5] }, 1, 0] } },
          pendingDrops: {
            $sum: { $cond: [{ $lte: ['$nextRecallDate', '$$NOW'] }, 1, 0] }
          },
          favoriteDrops: { $sum: { $cond: [{ $eq: ['$isFavorite', true] }, 1, 0] } },
          publicDrops: { $sum: { $cond: [{ $eq: ['$visibility', 'public'] }, 1, 0] } }
        }
      }
    ])
    .toArray()
    .then(function (results) {
      return results.length ? results[0] : {};
    });
}

/** Full export for the profile page's JSON download. */
function exportForUser(userId) {
  const ownerId = toObjectId(userId, 'userId');

  return Promise.all([
    drops().find({ createdBy: ownerId }).sort({ createdAt: 1 }).toArray(),
    collections().find({ createdBy: ownerId }).sort({ createdAt: 1 }).toArray(),
    recallHistory().find({ userId: ownerId }).sort({ recalledAt: 1 }).toArray()
  ]).then(function (results) {
    return {
      exportedAt: new Date(),
      drops: toPublicDrops(results[0], ownerId),
      collections: results[1].map(function (item) {
        return {
          id: String(item._id),
          name: item.name,
          description: item.description,
          color: item.color,
          isShared: item.isShared,
          drops: (item.drops || []).map(String),
          createdAt: item.createdAt
        };
      }),
      recallHistory: results[2].map(function (item) {
        return {
          dropId: String(item.dropId),
          recalledAt: item.recalledAt,
          recallType: item.recallType,
          confidence: item.confidence
        };
      })
    };
  });
}

module.exports = {
  createDrop: createDrop,
  findRawById: findRawById,
  findAccessible: findAccessible,
  listForUser: listForUser,
  listDue: listDue,
  listRecent: listRecent,
  listPublic: listPublic,
  updateDrop: updateDrop,
  toggleFavorite: toggleFavorite,
  deleteDrop: deleteDrop,
  bulkAction: bulkAction,
  recallDrop: recallDrop,
  getRelated: getRelated,
  suggestRelated: suggestRelated,
  relateDrops: relateDrops,
  unrelateDrops: unrelateDrops,
  getStats: getStats,
  exportForUser: exportForUser,
  toPublicDrop: toPublicDrop,
  toPublicDrops: toPublicDrops
};
