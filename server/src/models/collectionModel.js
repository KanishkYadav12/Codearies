'use strict';

/**
 * Collection model — native MongoDB driver only.
 *
 * A collection is a lightweight grouping of drops. Membership lives on the
 * collection document as an array of drop ids rather than as a field on each
 * drop, because the operations that matter (list a collection, count its drops,
 * share it) all start from the collection side.
 */

const crypto = require('crypto');
const connection = require('../db/connection');
const ApiError = require('../utils/ApiError');
const dropModel = require('./dropModel');
const searchService = require('../services/searchService');
const { toObjectId } = require('../utils/ids');
const {
  validateCollectionFields,
  normalizeText,
  LIMITS
} = require('../utils/validators');

const { COLLECTIONS } = connection;

// Muted, accessible defaults cycled through when the user does not pick one.
const DEFAULT_COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#60a5fa',
  '#f472b6',
  '#2dd4bf'
];

function collections() {
  return connection.getCollection(COLLECTIONS.COLLECTIONS);
}

function drops() {
  return connection.getCollection(COLLECTIONS.DROPS);
}

function randomColor() {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

/**
 * 32 hex characters from a CSPRNG. `Math.random` would be guessable, and a
 * guessable share token is an unauthenticated read of someone's collection.
 */
function generateShareToken() {
  return crypto.randomBytes(16).toString('hex');
}

function toPublicCollection(document, extras) {
  if (!document) {
    return null;
  }

  const additional = extras || {};

  return {
    id: String(document._id),
    name: document.name,
    description: document.description || '',
    color: document.color || DEFAULT_COLORS[0],
    createdBy: document.createdBy ? String(document.createdBy) : null,
    drops: (document.drops || []).map(String),
    dropCount:
      additional.dropCount !== undefined
        ? additional.dropCount
        : (document.drops || []).length,
    isShared: Boolean(document.isShared),
    // The token itself is only ever returned to the owner.
    shareToken: additional.includeToken ? document.shareToken || null : undefined,
    shareUrl: additional.shareUrl,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

function createCollection(fields, context) {
  const problems = validateCollectionFields(fields);

  if (problems.length) {
    return Promise.reject(ApiError.unprocessable('Invalid collection', problems));
  }

  const ownerId = toObjectId(context.userId, 'userId');
  const now = new Date();

  const document = {
    name: normalizeText(fields.name).slice(0, LIMITS.COLLECTION_NAME_MAX),
    description: fields.description
      ? String(fields.description).trim().slice(0, LIMITS.COLLECTION_DESCRIPTION_MAX)
      : '',
    createdBy: ownerId,
    drops: [],
    color: fields.color || randomColor(),
    isShared: false,
    shareToken: null,
    createdAt: now,
    updatedAt: now
  };

  return collections()
    .insertOne(document)
    .then(function (result) {
      document._id = result.insertedId;
      return toPublicCollection(document, { includeToken: true });
    })
    .catch(function (error) {
      // The compound unique index on (createdBy, name) enforces the spec's
      // "unique per user" rule.
      if (error && error.code === 11000) {
        throw ApiError.conflict('You already have a collection with that name', {
          field: 'name'
        });
      }
      throw error;
    });
}

/**
 * Lists a user's collections with an accurate drop count.
 *
 * `$lookup` + `$unwind` + `$group` resolve the membership array against the
 * drops collection so deleted drops never inflate the count — the array is
 * cleaned on delete, but the join keeps the number honest regardless.
 */
function listCollections(userId) {
  const ownerId = toObjectId(userId, 'userId');

  const pipeline = [
    { $match: { createdBy: ownerId } },
    {
      $lookup: {
        from: COLLECTIONS.DROPS,
        localField: 'drops',
        foreignField: '_id',
        as: 'dropDocs'
      }
    },
    { $unwind: { path: '$dropDocs', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$_id',
        name: { $first: '$name' },
        description: { $first: '$description' },
        color: { $first: '$color' },
        createdBy: { $first: '$createdBy' },
        drops: { $first: '$drops' },
        isShared: { $first: '$isShared' },
        shareToken: { $first: '$shareToken' },
        createdAt: { $first: '$createdAt' },
        updatedAt: { $first: '$updatedAt' },
        // preserveNull leaves a missing dropDocs for empty collections, so
        // count only the rows where the join actually produced a document.
        dropCount: {
          $sum: { $cond: [{ $ifNull: ['$dropDocs._id', false] }, 1, 0] }
        },
        masteredCount: {
          $sum: { $cond: [{ $gte: [{ $ifNull: ['$dropDocs.recallCount', 0] }, 5] }, 1, 0] }
        }
      }
    },
    { $sort: { createdAt: -1 } }
  ];

  return collections()
    .aggregate(pipeline)
    .toArray()
    .then(function (documents) {
      return documents.map(function (document) {
        const shaped = toPublicCollection(document, {
          dropCount: document.dropCount,
          includeToken: true
        });
        shaped.masteredCount = document.masteredCount;
        return shaped;
      });
    });
}

function findOwned(collectionId, userId) {
  return collections()
    .findOne({
      _id: toObjectId(collectionId, 'collectionId'),
      createdBy: toObjectId(userId, 'userId')
    })
    .then(function (document) {
      if (!document) {
        throw ApiError.notFound('Collection not found');
      }
      return document;
    });
}

/** A collection plus a paginated page of the drops inside it. */
function getCollectionWithDrops(collectionId, userId, query) {
  const ownerId = toObjectId(userId, 'userId');
  const pagination = searchService.buildPagination(query, 12);

  return findOwned(collectionId, ownerId).then(function (document) {
    const ids = document.drops || [];

    if (!ids.length) {
      return {
        collection: toPublicCollection(document, { dropCount: 0, includeToken: true }),
        drops: [],
        pagination: searchService.buildPageMeta(0, pagination)
      };
    }

    const filter = { _id: { $in: ids } };

    return Promise.all([
      drops()
        .find(filter)
        .sort(searchService.buildSort(query && query.sort))
        .skip(pagination.skip)
        .limit(pagination.limit)
        .toArray(),
      drops().countDocuments(filter)
    ]).then(function (results) {
      return {
        collection: toPublicCollection(document, {
          dropCount: results[1],
          includeToken: true
        }),
        drops: dropModel.toPublicDrops(results[0], ownerId),
        pagination: searchService.buildPageMeta(results[1], pagination)
      };
    });
  });
}

function updateCollection(collectionId, fields, context) {
  const problems = validateCollectionFields(fields, { partial: true });

  if (problems.length) {
    return Promise.reject(ApiError.unprocessable('Invalid collection update', problems));
  }

  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(collectionId, 'collectionId');
  const updates = { updatedAt: new Date() };

  if (fields.name !== undefined) {
    updates.name = normalizeText(fields.name).slice(0, LIMITS.COLLECTION_NAME_MAX);
  }

  if (fields.description !== undefined) {
    updates.description = String(fields.description || '')
      .trim()
      .slice(0, LIMITS.COLLECTION_DESCRIPTION_MAX);
  }

  if (fields.color !== undefined) {
    updates.color = fields.color;
  }

  if (fields.isShared !== undefined) {
    updates.isShared = Boolean(fields.isShared);

    // Un-sharing must invalidate the old link, otherwise anyone who kept the
    // URL regains access the moment sharing is re-enabled.
    if (!updates.isShared) {
      updates.shareToken = null;
    }
  }

  if (Object.keys(updates).length === 1) {
    return Promise.reject(ApiError.badRequest('No changes supplied'));
  }

  return collections()
    .findOneAndUpdate({ _id: id, createdBy: ownerId }, { $set: updates }, {
      returnDocument: 'after'
    })
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('Collection not found');
      }

      return toPublicCollection(document, { includeToken: true });
    })
    .catch(function (error) {
      if (error && error.code === 11000) {
        throw ApiError.conflict('You already have a collection with that name', {
          field: 'name'
        });
      }
      throw error;
    });
}

/**
 * Adds a drop to a collection.
 *
 * `$addToSet` makes this idempotent, so double-clicking "add to collection"
 * cannot produce a duplicate entry.
 */
function addDropToCollection(collectionId, dropId, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(collectionId, 'collectionId');
  const drop = toObjectId(dropId, 'dropId');

  // Confirm the user owns the drop too — otherwise a collection could hold a
  // reference to someone else's private drop.
  return drops()
    .findOne({ _id: drop, createdBy: ownerId }, { projection: { _id: 1 } })
    .then(function (found) {
      if (!found) {
        throw ApiError.notFound('Drop not found');
      }

      return collections().findOneAndUpdate(
        { _id: id, createdBy: ownerId },
        { $addToSet: { drops: drop }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    })
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('Collection not found');
      }

      return toPublicCollection(document, { includeToken: true });
    });
}

function removeDropFromCollection(collectionId, dropId, context) {
  const ownerId = toObjectId(context.userId, 'userId');

  return collections()
    .findOneAndUpdate(
      { _id: toObjectId(collectionId, 'collectionId'), createdBy: ownerId },
      {
        $pull: { drops: toObjectId(dropId, 'dropId') },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('Collection not found');
      }

      return toPublicCollection(document, { includeToken: true });
    });
}

/**
 * Deletes the collection only. Per the spec the drops inside survive — a
 * collection is a view onto drops, not their owner.
 */
function deleteCollection(collectionId, context) {
  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(collectionId, 'collectionId');

  return collections()
    .deleteOne({ _id: id, createdBy: ownerId })
    .then(function (result) {
      if (!result.deletedCount) {
        throw ApiError.notFound('Collection not found');
      }

      return { deleted: true, id: String(id), dropsRetained: true };
    });
}

/**
 * Turns sharing on and returns the public link.
 *
 * Idempotent: an already-shared collection keeps its existing token so a link
 * the user has already sent out does not silently break.
 */
function shareCollection(collectionId, context, baseUrl) {
  const ownerId = toObjectId(context.userId, 'userId');
  const id = toObjectId(collectionId, 'collectionId');

  return findOwned(id, ownerId).then(function (document) {
    const token = document.shareToken || generateShareToken();

    return collections()
      .findOneAndUpdate(
        { _id: id, createdBy: ownerId },
        { $set: { isShared: true, shareToken: token, updatedAt: new Date() } },
        { returnDocument: 'after' }
      )
      .then(function (result) {
        const updated = result && result.value ? result.value : result;

        return toPublicCollection(updated, {
          includeToken: true,
          shareUrl: baseUrl.replace(/\/$/, '') + '/share/' + token
        });
      });
  });
}

/** Revokes the link without deleting the collection. */
function unshareCollection(collectionId, context) {
  const ownerId = toObjectId(context.userId, 'userId');

  return collections()
    .findOneAndUpdate(
      { _id: toObjectId(collectionId, 'collectionId'), createdBy: ownerId },
      { $set: { isShared: false, shareToken: null, updatedAt: new Date() } },
      { returnDocument: 'after' }
    )
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('Collection not found');
      }

      return toPublicCollection(document, { includeToken: true });
    });
}

/**
 * Unauthenticated read of a shared collection.
 *
 * Deliberately narrow: it matches on `isShared` as well as the token, returns
 * only presentational fields, and never exposes the owner's id or the token
 * itself. Private drops inside a shared collection are still filtered out —
 * sharing a collection is not consent to publish every drop in it.
 */
function findByShareToken(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/i.test(token)) {
    return Promise.reject(ApiError.notFound('Shared collection not found'));
  }

  return collections()
    .findOne({ shareToken: token, isShared: true })
    .then(function (document) {
      if (!document) {
        throw ApiError.notFound('Shared collection not found');
      }

      const ids = document.drops || [];

      return Promise.all([
        ids.length
          ? drops()
              .find({ _id: { $in: ids }, visibility: 'public' })
              .sort({ createdAt: -1 })
              .toArray()
          : Promise.resolve([]),
        connection
          .getCollection(COLLECTIONS.USERS)
          .findOne({ _id: document.createdBy }, { projection: { username: 1 } })
      ]).then(function (results) {
        const visibleDrops = results[0];
        const owner = results[1];

        return {
          collection: {
            name: document.name,
            description: document.description || '',
            color: document.color,
            dropCount: visibleDrops.length,
            // How many drops are withheld because they are private.
            hiddenCount: Math.max(0, ids.length - visibleDrops.length),
            owner: owner ? owner.username : 'Unknown',
            createdAt: document.createdAt
          },
          drops: visibleDrops.map(function (drop) {
            return {
              id: String(drop._id),
              title: drop.title,
              content: drop.content,
              type: drop.type,
              language: drop.language || null,
              tags: drop.tags || [],
              createdAt: drop.createdAt
            };
          })
        };
      });
    });
}

function countForUser(userId) {
  return collections().countDocuments({ createdBy: toObjectId(userId, 'userId') });
}

module.exports = {
  createCollection: createCollection,
  listCollections: listCollections,
  getCollectionWithDrops: getCollectionWithDrops,
  findOwned: findOwned,
  updateCollection: updateCollection,
  addDropToCollection: addDropToCollection,
  removeDropFromCollection: removeDropFromCollection,
  deleteCollection: deleteCollection,
  shareCollection: shareCollection,
  unshareCollection: unshareCollection,
  findByShareToken: findByShareToken,
  countForUser: countForUser,
  toPublicCollection: toPublicCollection,
  DEFAULT_COLORS: DEFAULT_COLORS
};
