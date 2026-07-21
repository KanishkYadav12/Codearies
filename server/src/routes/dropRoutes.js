'use strict';

const express = require('express');
const dropController = require('../controllers/dropController');
const { requireAuth } = require('../middleware/auth');
const { requireDropOwnership } = require('../middleware/ownership');
const { recallLimiter } = require('../middleware/rateLimiter');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

// Every drop route is protected.
router.use(requireAuth);

/* ------------------------------------------------------------------ */
/* Literal paths first                                                 */
/*                                                                     */
/* Express matches in declaration order, so `/recall`, `/stats`,       */
/* `/recent` and `/bulk` must be registered before `/:id` — otherwise  */
/* `/api/drops/recall` is captured by the parameterised route and the  */
/* handler receives the literal string "recall" as an id.              */
/* ------------------------------------------------------------------ */

router.get(
  '/recall',
  recallLimiter,
  validate(schemas.recallQuery, 'query'),
  dropController.getRecallQueue
);

router.get('/stats', dropController.getStats);
router.get('/recent', dropController.getRecent);

router.post('/bulk', validate(schemas.bulk), dropController.bulkAction);

router.get(
  '/related/:id',
  validate(schemas.idParam, 'params'),
  dropController.getRelated
);

/* ------------------------------------------------------------------ */
/* Collection-level                                                    */
/* ------------------------------------------------------------------ */

router.get('/', validate(schemas.dropQuery, 'query'), dropController.listDrops);
router.post('/', validate(schemas.createDrop), dropController.createDrop);

/* ------------------------------------------------------------------ */
/* Item-level                                                          */
/* ------------------------------------------------------------------ */

router.get('/:id', validate(schemas.idParam, 'params'), dropController.getDrop);

router.put(
  '/:id',
  validate(schemas.idParam, 'params'),
  requireDropOwnership,
  validate(schemas.updateDrop),
  dropController.updateDrop
);

router.delete(
  '/:id',
  validate(schemas.idParam, 'params'),
  requireDropOwnership,
  dropController.deleteDrop
);

router.patch(
  '/:id/favorite',
  validate(schemas.idParam, 'params'),
  requireDropOwnership,
  dropController.toggleFavorite
);

router.post(
  '/:id/recall',
  recallLimiter,
  validate(schemas.idParam, 'params'),
  requireDropOwnership,
  validate(schemas.recall),
  dropController.recallDrop
);

router.post(
  '/:id/relate',
  validate(schemas.idParam, 'params'),
  requireDropOwnership,
  validate(schemas.relate),
  dropController.relateDrop
);

router.delete(
  '/:id/relate/:relatedId',
  requireDropOwnership,
  dropController.unrelateDrop
);

module.exports = router;
