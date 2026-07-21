'use strict';

/**
 * Ownership middleware.
 *
 * Runs after `requireAuth` and before any handler that mutates a drop or a
 * collection. Loading the document here means the handler never has to re-check
 * who owns it, and — importantly — it lets us distinguish 404 from 403:
 *
 *   - the document does not exist        -> 404
 *   - it exists but belongs to a stranger -> 404 as well, not 403
 *
 * Returning 404 for someone else's private document is deliberate. A 403 would
 * confirm that a given id exists, which turns the endpoint into an enumeration
 * oracle. Public documents are the one case where a real 403 is safe, because
 * their existence is not a secret.
 */

const connection = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { toObjectId, sameId } = require('../utils/ids');

const { COLLECTIONS } = connection;

/**
 * Builds a middleware that loads `collectionName` by `req.params[paramName]`
 * and asserts the current user owns it. The document is attached to
 * `req[attachAs]` so the handler can reuse it without a second query.
 */
function requireOwnership(options) {
  const settings = options || {};
  const collectionName = settings.collection;
  const paramName = settings.param || 'id';
  const attachAs = settings.attachAs || 'resource';
  const label = settings.label || 'Resource';

  return function ownershipMiddleware(req, res, next) {
    if (!req.user) {
      next(ApiError.unauthorized('Authentication required'));
      return;
    }

    let documentId;

    try {
      documentId = toObjectId(req.params[paramName], paramName);
    } catch (error) {
      next(error);
      return;
    }

    connection
      .getCollection(collectionName)
      .findOne({ _id: documentId })
      .then(function (document) {
        if (!document) {
          throw ApiError.notFound(label + ' not found');
        }

        if (!sameId(document.createdBy, req.user.id)) {
          // Public drops exist openly, so admitting "you cannot edit this" is
          // safe. Everything else is indistinguishable from "does not exist".
          if (document.visibility === 'public') {
            throw ApiError.forbidden('You can only modify your own ' + label.toLowerCase());
          }
          throw ApiError.notFound(label + ' not found');
        }

        req[attachAs] = document;
        next();
      })
      .catch(next);
  };
}

const requireDropOwnership = requireOwnership({
  collection: COLLECTIONS.DROPS,
  param: 'id',
  attachAs: 'drop',
  label: 'Drop'
});

const requireCollectionOwnership = requireOwnership({
  collection: COLLECTIONS.COLLECTIONS,
  param: 'id',
  attachAs: 'collection',
  label: 'Collection'
});

module.exports = {
  requireOwnership: requireOwnership,
  requireDropOwnership: requireDropOwnership,
  requireCollectionOwnership: requireCollectionOwnership
};
