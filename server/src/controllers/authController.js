'use strict';

/**
 * Auth controller.
 *
 * Backend constraint #4: no `async`/`await` anywhere in the controllers. Every
 * handler is an explicit promise chain terminating in `.catch(next)`, which
 * hands the failure to the global error handler.
 */

const userModel = require('../models/userModel');
const dropModel = require('../models/dropModel');
const collectionModel = require('../models/collectionModel');
const tokenUtil = require('../utils/token');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger').child('auth');

/** Issues the JWT, sets the httpOnly cookie and shapes the auth response. */
function respondWithSession(res, user, statusCode) {
  const token = tokenUtil.signToken(user);

  // Belt and braces: the token is returned in the body for the client's
  // "Remember me" localStorage flow *and* set as an httpOnly cookie, which
  // survives a page refresh without exposing the token to scripts.
  res.cookie(tokenUtil.COOKIE_NAME, token, tokenUtil.cookieOptions());

  res.status(statusCode || 200).json({
    success: true,
    data: { user: user, token: token }
  });
}

/**
 * POST /api/auth/register
 *
 * The new account is signed straight in — making someone log in again
 * immediately after registering is friction with no security benefit.
 */
function register(req, res, next) {
  userModel
    .createUser({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password
    })
    .then(function (user) {
      logger.info('User registered', { userId: user.id, username: user.username });

      // Record the signup as the first session so `lastLogin` is never null.
      return userModel.recordLogin(user.id, req.clientIp);
    })
    .then(function (user) {
      respondWithSession(res, user, 201);
    })
    .catch(next);
}

/**
 * POST /api/auth/login
 *
 * Session tracking (last login timestamp + IP) happens here.
 */
function login(req, res, next) {
  const email = req.body.email;

  userModel
    .findByEmailWithPassword(email)
    .then(function (document) {
      if (!document) {
        // Same message and timing-insensitive path as a wrong password, so the
        // endpoint cannot be used to discover which emails are registered.
        throw ApiError.unauthorized('Invalid email or password');
      }

      return userModel.verifyPassword(req.body.password, document.password).then(function (ok) {
        if (!ok) {
          logger.warn('Failed login attempt', { email: email, ip: req.clientIp });
          throw ApiError.unauthorized('Invalid email or password');
        }

        return userModel.recordLogin(document._id, req.clientIp);
      });
    })
    .then(function (user) {
      logger.info('User signed in', { userId: user.id, ip: req.clientIp });
      respondWithSession(res, user, 200);
    })
    .catch(next);
}

/**
 * POST /api/auth/logout
 *
 * Clears the cookie and revokes the token's jti, so a copy of the token that
 * was captured elsewhere stops working immediately rather than at expiry.
 */
function logout(req, res, next) {
  Promise.resolve()
    .then(function () {
      const token = tokenUtil.extractToken(req);

      if (token) {
        tokenUtil.revokeToken(token);
      }

      res.clearCookie(tokenUtil.COOKIE_NAME, tokenUtil.cookieOptions());

      res.status(200).json({
        success: true,
        data: { message: 'Signed out' }
      });
    })
    .catch(next);
}

/**
 * GET /api/auth/me
 *
 * Returns the profile plus the aggregate counters the profile page renders,
 * so the client does not need a second request on load.
 */
function me(req, res, next) {
  Promise.all([
    dropModel.getStats(req.user.id),
    collectionModel.countForUser(req.user.id)
  ])
    .then(function (results) {
      const stats = results[0];
      stats.totalCollections = results[1];

      res.status(200).json({
        success: true,
        data: { user: req.user, stats: stats }
      });
    })
    .catch(next);
}

/** PUT /api/auth/preferences */
function updatePreferences(req, res, next) {
  userModel
    .updatePreferences(req.user.id, req.body)
    .then(function (user) {
      logger.info('Preferences updated', { userId: user.id, changes: Object.keys(req.body) });

      res.status(200).json({
        success: true,
        data: { user: user }
      });
    })
    .catch(next);
}

/**
 * GET /api/auth/export
 *
 * Full data export for the profile page's JSON download. Sent with a
 * Content-Disposition header so the browser saves it as a file.
 */
function exportData(req, res, next) {
  dropModel
    .exportForUser(req.user.id)
    .then(function (payload) {
      const filename = 'devdrops-export-' + new Date().toISOString().slice(0, 10) + '.json';

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');

      res.status(200).json({
        exportedAt: payload.exportedAt,
        user: req.user,
        drops: payload.drops,
        collections: payload.collections,
        recallHistory: payload.recallHistory
      });
    })
    .catch(next);
}

module.exports = {
  register: register,
  login: login,
  logout: logout,
  me: me,
  updatePreferences: updatePreferences,
  exportData: exportData
};
