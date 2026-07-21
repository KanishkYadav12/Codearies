'use strict';

const express = require('express');
const collectionController = require('../controllers/collectionController');
const { requireAuth } = require('../middleware/auth');
const { requireCollectionOwnership } = require('../middleware/ownership');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

// Every collection route is protected.
router.use(requireAuth);

router.get('/', collectionController.listCollections);
router.post('/', validate(schemas.createCollection), collectionController.createCollection);

router.get(
  '/:id',
  validate(schemas.idParam, 'params'),
  requireCollectionOwnership,
  collectionController.getCollection
);

router.put(
  '/:id',
  validate(schemas.idParam, 'params'),
  requireCollectionOwnership,
  validate(schemas.updateCollection),
  collectionController.updateCollection
);

router.delete(
  '/:id',
  validate(schemas.idParam, 'params'),
  requireCollectionOwnership,
  collectionController.deleteCollection
);

router.post(
  '/:id/drops',
  validate(schemas.idParam, 'params'),
  requireCollectionOwnership,
  validate(schemas.addDropToCollection),
  collectionController.addDrop
);

router.delete(
  '/:id/drops/:dropId',
  validate(schemas.collectionDropParams, 'params'),
  requireCollectionOwnership,
  collectionController.removeDrop
);

// Generating the link is a GET per the spec's route table, even though it
// creates a token on first call. Kept idempotent so that remains defensible:
// repeat calls return the same token rather than rotating it.
router.get(
  '/:id/share',
  validate(schemas.idParam, 'params'),
  requireCollectionOwnership,
  collectionController.shareCollection
);

router.delete(
  '/:id/share',
  validate(schemas.idParam, 'params'),
  requireCollectionOwnership,
  collectionController.unshareCollection
);

module.exports = router;
