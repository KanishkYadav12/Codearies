'use strict';

const express = require('express');
const publicController = require('../controllers/publicController');
const { optionalAuth } = require('../middleware/auth');
const { publicLimiter } = require('../middleware/rateLimiter');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

// Spec: public endpoints are limited to 20 requests per minute.
router.use(publicLimiter);

// No auth required — but if a token happens to be present we attach the user,
// so a signed-in visitor browsing the feed still sees their own ownership flags.
router.use(optionalAuth);

router.get('/explore', validate(schemas.publicQuery, 'query'), publicController.explore);

router.get(
  '/share/:token',
  validate(schemas.shareTokenParams, 'params'),
  publicController.viewSharedCollection
);

module.exports = router;
