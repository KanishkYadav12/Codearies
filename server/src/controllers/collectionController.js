'use strict';

/**
 * Collection controller. Promise chains only — no async/await.
 */

const collectionModel = require('../models/collectionModel');
const env = require('../config/env');
const logger = require('../utils/logger').child('collections');

function contextFrom(req) {
  return { userId: req.user.id };
}

/** GET /api/collections */
function listCollections(req, res, next) {
  collectionModel
    .listCollections(req.user.id)
    .then(function (collections) {
      res.status(200).json({ success: true, data: collections });
    })
    .catch(next);
}

/** GET /api/collections/:id — the collection plus a page of its drops. */
function getCollection(req, res, next) {
  collectionModel
    .getCollectionWithDrops(req.params.id, req.user.id, req.query)
    .then(function (result) {
      res.status(200).json({
        success: true,
        data: { collection: result.collection, drops: result.drops },
        pagination: result.pagination
      });
    })
    .catch(next);
}

/** POST /api/collections */
function createCollection(req, res, next) {
  collectionModel
    .createCollection(req.body, contextFrom(req))
    .then(function (collection) {
      logger.info('Collection created', { collectionId: collection.id, userId: req.user.id });
      res.status(201).json({ success: true, data: collection });
    })
    .catch(next);
}

/** PUT /api/collections/:id */
function updateCollection(req, res, next) {
  collectionModel
    .updateCollection(req.params.id, req.body, contextFrom(req))
    .then(function (collection) {
      res.status(200).json({ success: true, data: collection });
    })
    .catch(next);
}

/** POST /api/collections/:id/drops */
function addDrop(req, res, next) {
  collectionModel
    .addDropToCollection(req.params.id, req.body.dropId, contextFrom(req))
    .then(function (collection) {
      res.status(200).json({ success: true, data: collection });
    })
    .catch(next);
}

/** DELETE /api/collections/:id/drops/:dropId */
function removeDrop(req, res, next) {
  collectionModel
    .removeDropFromCollection(req.params.id, req.params.dropId, contextFrom(req))
    .then(function (collection) {
      res.status(200).json({ success: true, data: collection });
    })
    .catch(next);
}

/** DELETE /api/collections/:id — the drops inside are intentionally kept. */
function deleteCollection(req, res, next) {
  collectionModel
    .deleteCollection(req.params.id, contextFrom(req))
    .then(function (result) {
      logger.info('Collection deleted', { collectionId: result.id, userId: req.user.id });
      res.status(200).json({ success: true, data: result });
    })
    .catch(next);
}

/**
 * GET /api/collections/:id/share — enables sharing and returns the public link.
 *
 * The link points at the *frontend* share route, not the API, because that is
 * what the user pastes to another person.
 */
function shareCollection(req, res, next) {
  collectionModel
    .shareCollection(req.params.id, contextFrom(req), env.PUBLIC_APP_URL)
    .then(function (collection) {
      logger.info('Collection shared', { collectionId: collection.id, userId: req.user.id });

      res.status(200).json({
        success: true,
        data: {
          collection: collection,
          shareUrl: collection.shareUrl,
          shareToken: collection.shareToken
        }
      });
    })
    .catch(next);
}

/** DELETE /api/collections/:id/share — revokes the link. */
function unshareCollection(req, res, next) {
  collectionModel
    .unshareCollection(req.params.id, contextFrom(req))
    .then(function (collection) {
      res.status(200).json({ success: true, data: collection });
    })
    .catch(next);
}

module.exports = {
  listCollections: listCollections,
  getCollection: getCollection,
  createCollection: createCollection,
  updateCollection: updateCollection,
  addDrop: addDrop,
  removeDrop: removeDrop,
  deleteCollection: deleteCollection,
  shareCollection: shareCollection,
  unshareCollection: unshareCollection
};
