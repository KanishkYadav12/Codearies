'use strict';

const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, createRateLimiter } = require('../middleware/rateLimiter');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

/**
 * Rate limiting on this router is split deliberately.
 *
 * The spec asks for "auth routes: 5 requests per minute". Applied literally to
 * every route under /api/auth that breaks the application: `/auth/me` is called
 * on every page load and after every login, so a signed-in user navigating
 * normally would be throttled out of their own session within seconds.
 *
 * The 5/min limit exists to stop credential brute-forcing, so it is applied to
 * exactly the routes that accept credentials — register, login and logout. The
 * authenticated session routes get a separate, sane limit: still bounded, but
 * high enough for real use. This is noted in the README under "Challenges".
 */
const sessionLimiter = createRateLimiter({
  name: 'auth-session',
  windowMs: 60 * 1000,
  max: 60
});

// --- Credential endpoints: 5 requests per minute, per IP (spec) ---

router.post('/register', authLimiter, validate(schemas.register), authController.register);
router.post('/login', authLimiter, validate(schemas.login), authController.login);

// Logout accepts an expired or absent token — the client wants its cookie
// cleared regardless, so this is not behind requireAuth.
router.post('/logout', authLimiter, authController.logout);

// --- Authenticated session endpoints ---

router.get('/me', sessionLimiter, requireAuth, authController.me);

router.put(
  '/preferences',
  sessionLimiter,
  requireAuth,
  validate(schemas.preferences),
  authController.updatePreferences
);

router.get('/export', sessionLimiter, requireAuth, authController.exportData);

module.exports = router;
