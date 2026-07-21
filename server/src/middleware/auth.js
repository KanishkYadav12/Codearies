'use strict';

/**
 * Authentication middleware.
 *
 * `requireAuth` rejects anonymous requests; `optionalAuth` attaches the user
 * when a token is present but lets the request through when it is not (used by
 * the public explore feed so a signed-in user still sees ownership flags).
 */

const userModel = require('../models/userModel');
const tokenUtil = require('../utils/token');
const ApiError = require('../utils/ApiError');

/**
 * Resolves the token to a live user document.
 *
 * The database lookup is deliberate: a token alone is not proof the account
 * still exists. It also gives every downstream handler the user's current
 * preferences, which the recall scheduler needs on each write.
 */
function loadUser(token) {
  const payload = tokenUtil.verifyToken(token);

  return userModel.findRawById(payload.sub).then(function (document) {
    if (!document) {
      throw ApiError.unauthorized('Account no longer exists');
    }

    return {
      user: userModel.toPublicUser(document),
      payload: payload
    };
  });
}

function requireAuth(req, res, next) {
  const token = tokenUtil.extractToken(req);

  if (!token) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  loadUser(token)
    .then(function (result) {
      req.user = result.user;
      req.userId = result.user.id;
      req.token = token;
      req.tokenPayload = result.payload;
      next();
    })
    .catch(next);
}

function optionalAuth(req, res, next) {
  const token = tokenUtil.extractToken(req);

  if (!token) {
    next();
    return;
  }

  loadUser(token)
    .then(function (result) {
      req.user = result.user;
      req.userId = result.user.id;
      req.token = token;
      req.tokenPayload = result.payload;
      next();
    })
    .catch(function () {
      // An invalid token on an optional route is treated as "not signed in"
      // rather than an error — the endpoint is public either way.
      next();
    });
}

module.exports = {
  requireAuth: requireAuth,
  optionalAuth: optionalAuth
};
