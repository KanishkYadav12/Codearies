'use strict';

/**
 * JWT issuing, verification and revocation.
 *
 * JWTs are stateless, which makes a real `logout` awkward: the token stays
 * valid until it expires no matter what the server says. We keep a small
 * in-memory revocation set keyed by the token's `jti`, so a logged-out token is
 * rejected for the remainder of its life. Entries are evicted once they expire,
 * bounding the set by the number of logouts inside one token lifetime.
 *
 * (A multi-instance deployment would move this set to Redis. The spec forbids
 * third-party services beyond Atlas/Vercel/Render, so in-memory it stays — and
 * the trade-off is documented in the README rather than hidden here.)
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('./ApiError');

// jti -> expiry (epoch ms)
const revoked = new Map();

// Sweep expired entries occasionally rather than on every request.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweep() {
  const now = Date.now();

  if (now - lastSweep < SWEEP_INTERVAL_MS) {
    return;
  }

  lastSweep = now;

  revoked.forEach(function (expiresAt, jti) {
    if (expiresAt <= now) {
      revoked.delete(jti);
    }
  });
}

function signToken(user) {
  const payload = {
    sub: String(user.id || user._id),
    username: user.username,
    // Random id so an individual token can be revoked on logout.
    jti: crypto.randomBytes(12).toString('hex')
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: 'devdrops'
  });
}

/**
 * Verifies signature, expiry and issuer, and rejects revoked tokens.
 * Always throws ApiError so the error handler never has to know about
 * jsonwebtoken's error classes.
 */
function verifyToken(token) {
  sweep();

  let payload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'devdrops' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired, please sign in again');
    }
    throw ApiError.unauthorized('Invalid authentication token');
  }

  if (payload.jti && revoked.has(payload.jti)) {
    throw ApiError.unauthorized('This session has been logged out');
  }

  return payload;
}

/** Adds a token's jti to the revocation set until its natural expiry. */
function revokeToken(token) {
  try {
    const payload = jwt.decode(token);

    if (payload && payload.jti && payload.exp) {
      revoked.set(payload.jti, payload.exp * 1000);
    }
  } catch (error) {
    // A malformed token on logout is not worth failing the request over —
    // the client is discarding it either way.
  }
}

/** Reads the token from the Authorization header, falling back to the cookie. */
function extractToken(req) {
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }

  if (req.cookies && req.cookies.devdrops_token) {
    return req.cookies.devdrops_token;
  }

  return null;
}

/** Cookie options for the httpOnly session cookie set alongside the header. */
function cookieOptions() {
  const days = Number.parseInt(env.JWT_EXPIRES_IN, 10) || 7;

  return {
    httpOnly: true,
    // Cross-site in production (Vercel frontend -> Render API), which requires
    // SameSite=None and therefore Secure.
    sameSite: env.isProduction ? 'none' : 'lax',
    secure: env.isProduction,
    maxAge: days * 24 * 60 * 60 * 1000,
    path: '/'
  };
}

module.exports = {
  signToken: signToken,
  verifyToken: verifyToken,
  revokeToken: revokeToken,
  extractToken: extractToken,
  cookieOptions: cookieOptions,
  COOKIE_NAME: 'devdrops_token'
};
