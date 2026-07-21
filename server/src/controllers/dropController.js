'use strict';

/**
 * Drop controller. Promise chains only — no async/await (backend constraint #4).
 *
 * Handlers stay thin: validation happened in middleware, ownership happened in
 * middleware, and the business rules live in the model and the services. What
 * is left here is request shaping and the HTTP response.
 */

const dropModel = require('../models/dropModel');
const collectionModel = require('../models/collectionModel');
const recallHistoryModel = require('../models/recallHistoryModel');
const recallService = require('../services/recallService');
const logger = require('../utils/logger').child('drops');

/** Context passed to the model: who is acting, and with which preferences. */
function contextFrom(req) {
  return {
    userId: req.user.id,
    preferences: req.user.preferences
  };
}

/** GET /api/drops — paginated, filterable listing of the user's drops. */
function listDrops(req, res, next) {
  dropModel
    .listForUser(req.query, contextFrom(req))
    .then(function (result) {
      res.status(200).json({
        success: true,
        data: result.drops,
        pagination: result.pagination
      });
    })
    .catch(next);
}

/**
 * GET /api/drops/recall — the recall queue.
 *
 * Also returns today's progress so recall mode can render "3 of 7 recalled
 * today" without a second request.
 */
function getRecallQueue(req, res, next) {
  Promise.all([
    dropModel.listDue(contextFrom(req), req.query.limit),
    recallHistoryModel.countToday(req.user.id)
  ])
    .then(function (results) {
      const queue = results[0];
      const recalledToday = results[1];

      res.status(200).json({
        success: true,
        data: queue.drops,
        meta: {
          total: queue.total,
          recalledToday: recalledToday,
          // Total drops that have been in scope today: those still due plus
          // those already cleared.
          dueToday: queue.total + recalledToday
        }
      });
    })
    .catch(next);
}

/** GET /api/drops/stats — dashboard and profile statistics. */
function getStats(req, res, next) {
  dropModel
    .getStats(req.user.id)
    .then(function (stats) {
      res.status(200).json({
        success: true,
        data: stats
      });
    })
    .catch(next);
}

/** GET /api/drops/recent — last few created or updated drops. */
function getRecent(req, res, next) {
  dropModel
    .listRecent(req.user.id, 5)
    .then(function (drops) {
      res.status(200).json({ success: true, data: drops });
    })
    .catch(next);
}

/**
 * GET /api/drops/:id — full detail.
 *
 * Bundles the recall history and the upcoming interval ladder, which the detail
 * page renders alongside the content.
 */
function getDrop(req, res, next) {
  dropModel
    .findAccessible(req.params.id, req.user ? req.user.id : null)
    .then(function (document) {
      if (!document) {
        res.status(404).json({
          success: false,
          error: { message: 'Drop not found', status: 404, requestId: req.id }
        });
        return null;
      }

      const viewerId = req.user ? req.user.id : null;
      const drop = dropModel.toPublicDrop(document, viewerId);

      if (!drop.isOwner) {
        // A viewer of someone else's public drop gets the content, not the
        // owner's private review schedule.
        res.status(200).json({ success: true, data: { drop: drop, history: [] } });
        return null;
      }

      return recallHistoryModel
        .listForDrop(document._id, req.user.id, 10)
        .then(function (history) {
          res.status(200).json({
            success: true,
            data: {
              drop: drop,
              history: history,
              schedule: recallService.previewSchedule(8, req.user.preferences.recallInterval)
            }
          });
        });
    })
    .catch(next);
}

/**
 * POST /api/drops — create.
 *
 * Type, language and tags are auto-derived when not supplied, and
 * `nextRecallDate` is scheduled by the recall service. Optionally files the new
 * drop into a collection in the same request.
 */
function createDrop(req, res, next) {
  const collectionId = req.body.collectionId;

  dropModel
    .createDrop(req.body, contextFrom(req))
    .then(function (drop) {
      logger.info('Drop created', {
        dropId: drop.id,
        userId: req.user.id,
        type: drop.type,
        autoDetected: drop.autoDetected
      });

      if (!collectionId) {
        return drop;
      }

      // Filing is best-effort: the drop exists either way, and failing the
      // whole create because a collection was deleted mid-request is worse
      // than returning the drop with a warning.
      return collectionModel
        .addDropToCollection(collectionId, drop.id, contextFrom(req))
        .then(function () {
          return drop;
        })
        .catch(function (error) {
          logger.warn('Could not file new drop into collection', {
            dropId: drop.id,
            collectionId: collectionId,
            reason: error.message
          });
          return drop;
        });
    })
    .then(function (drop) {
      res.status(201).json({ success: true, data: drop });
    })
    .catch(next);
}

/** PUT /api/drops/:id — owner only (enforced by ownership middleware). */
function updateDrop(req, res, next) {
  dropModel
    .updateDrop(req.params.id, req.body, contextFrom(req))
    .then(function (drop) {
      logger.info('Drop updated', { dropId: drop.id, fields: Object.keys(req.body) });
      res.status(200).json({ success: true, data: drop });
    })
    .catch(next);
}

/** PATCH /api/drops/:id/favorite — optimistic-update friendly toggle. */
function toggleFavorite(req, res, next) {
  dropModel
    .toggleFavorite(req.params.id, contextFrom(req))
    .then(function (drop) {
      res.status(200).json({ success: true, data: drop });
    })
    .catch(next);
}

/** DELETE /api/drops/:id — transactional cascade. */
function deleteDrop(req, res, next) {
  dropModel
    .deleteDrop(req.params.id, contextFrom(req))
    .then(function (result) {
      logger.info('Drop deleted', {
        dropId: result.id,
        userId: req.user.id,
        recallHistoryRemoved: result.recallHistoryRemoved
      });

      res.status(200).json({ success: true, data: result });
    })
    .catch(next);
}

/** POST /api/drops/bulk — multi-select actions, transactional. */
function bulkAction(req, res, next) {
  const payload = {
    visibility: req.body.visibility,
    isFavorite: req.body.isFavorite,
    collectionId: req.body.collectionId
  };

  dropModel
    .bulkAction(req.body.dropIds, req.body.action, payload, contextFrom(req))
    .then(function (result) {
      logger.info('Bulk action applied', {
        userId: req.user.id,
        action: result.action,
        affected: result.affected
      });

      res.status(200).json({ success: true, data: result });
    })
    .catch(next);
}

/**
 * POST /api/drops/:id/recall — the core interaction.
 *
 * Advances the Fibonacci schedule, writes a history row and reports whether
 * this recall crossed the mastery threshold so the UI can celebrate it.
 */
function recallDrop(req, res, next) {
  dropModel
    .recallDrop(
      req.params.id,
      { confidence: req.body.confidence, recallType: req.body.recallType },
      contextFrom(req)
    )
    .then(function (result) {
      logger.info('Drop recalled', {
        dropId: result.drop.id,
        userId: req.user.id,
        recallCount: result.drop.recallCount,
        nextIn: result.intervalLabel,
        justMastered: result.justMastered
      });

      return recallHistoryModel.countToday(req.user.id).then(function (recalledToday) {
        res.status(200).json({
          success: true,
          data: {
            drop: result.drop,
            nextRecallDate: result.drop.nextRecallDate,
            intervalHours: result.intervalHours,
            intervalLabel: result.intervalLabel,
            justMastered: result.justMastered,
            recalledToday: recalledToday
          }
        });
      });
    })
    .catch(next);
}

/** GET /api/drops/related/:id — linked drops plus fresh suggestions. */
function getRelated(req, res, next) {
  dropModel
    .getRelated(req.params.id, req.user ? req.user.id : null)
    .then(function (result) {
      res.status(200).json({
        success: true,
        data: { related: result.related, suggested: result.suggested }
      });
    })
    .catch(next);
}

/** POST /api/drops/:id/relate — bidirectional link. */
function relateDrop(req, res, next) {
  dropModel
    .relateDrops(req.params.id, req.body.relatedDropId, contextFrom(req))
    .then(function (drop) {
      logger.info('Drops related', {
        source: req.params.id,
        target: req.body.relatedDropId,
        userId: req.user.id
      });

      res.status(200).json({ success: true, data: drop });
    })
    .catch(next);
}

/** DELETE /api/drops/:id/relate/:relatedId — removes the link both ways. */
function unrelateDrop(req, res, next) {
  dropModel
    .unrelateDrops(req.params.id, req.params.relatedId, contextFrom(req))
    .then(function (drop) {
      res.status(200).json({ success: true, data: drop });
    })
    .catch(next);
}

module.exports = {
  listDrops: listDrops,
  getRecallQueue: getRecallQueue,
  getStats: getStats,
  getRecent: getRecent,
  getDrop: getDrop,
  createDrop: createDrop,
  updateDrop: updateDrop,
  toggleFavorite: toggleFavorite,
  deleteDrop: deleteDrop,
  bulkAction: bulkAction,
  recallDrop: recallDrop,
  getRelated: getRelated,
  relateDrop: relateDrop,
  unrelateDrop: unrelateDrop
};
