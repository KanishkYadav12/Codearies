'use strict';

/**
 * Public controller — the only endpoints reachable without a token.
 *
 * Everything here is read-only and deliberately narrow in what it returns.
 * Responses are cached briefly at the CDN/browser layer since the data is not
 * user-specific.
 */

const dropModel = require('../models/dropModel');
const collectionModel = require('../models/collectionModel');

/** GET /api/public/explore — paginated feed of public drops. */
function explore(req, res, next) {
  dropModel
    .listPublic(req.query)
    .then(function (result) {
      // Short public cache: the feed changes slowly and this endpoint is the
      // most exposed one on the API.
      res.setHeader('Cache-Control', 'public, max-age=30');

      res.status(200).json({
        success: true,
        data: result.drops,
        pagination: result.pagination
      });
    })
    .catch(next);
}

/** GET /api/public/share/:token — read-only view of a shared collection. */
function viewSharedCollection(req, res, next) {
  collectionModel
    .findByShareToken(req.params.token)
    .then(function (result) {
      res.setHeader('Cache-Control', 'public, max-age=60');

      res.status(200).json({
        success: true,
        data: { collection: result.collection, drops: result.drops }
      });
    })
    .catch(next);
}

module.exports = {
  explore: explore,
  viewSharedCollection: viewSharedCollection
};
