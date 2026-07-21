'use strict';

/**
 * Custom rate limiter (no express-rate-limit).
 *
 * Implements a **sliding window** rather than a fixed one. A fixed window lets
 * a client send its whole quota at 0:59 and again at 1:01 — double the intended
 * rate across a two-second span. Here each key keeps the timestamps of its
 * recent hits and we count only those inside the trailing window.
 *
 * State is per-process and in memory. That is the correct scope for this
 * deployment (one API instance, no Redis allowed by the spec's third-party
 * rule); the README notes what would change behind multiple instances.
 */

const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger').child('ratelimit');

// key -> array of hit timestamps (ms), ascending
const buckets = new Map();

// Bound total memory: without eviction a stream of unique IPs grows the map
// without limit, which is a slow denial of service against ourselves.
const MAX_KEYS = 10000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

let cleanupTimer = null;

/** Drops keys whose most recent hit is older than the longest window we use. */
function startCleanup(maxWindowMs) {
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(function () {
    const cutoff = Date.now() - maxWindowMs;

    buckets.forEach(function (hits, key) {
      if (!hits.length || hits[hits.length - 1] < cutoff) {
        buckets.delete(key);
      }
    });
  }, CLEANUP_INTERVAL_MS);

  // Do not hold the event loop open on shutdown.
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Identifies the caller. Authenticated users are limited per account so that
 * several people behind one office NAT do not share a quota; anonymous callers
 * fall back to IP.
 */
function defaultKeyGenerator(req) {
  if (req.user && req.user.id) {
    return 'user:' + req.user.id;
  }
  return 'ip:' + (req.clientIp || req.ip || 'unknown');
}

/**
 * Creates a limiter.
 *
 * @param {object} options
 * @param {number} options.windowMs  width of the sliding window
 * @param {number} options.max       hits allowed inside the window
 * @param {string} options.name      label used in logs and error details
 */
function createRateLimiter(options) {
  const settings = options || {};
  const windowMs = settings.windowMs || 60 * 1000;
  const max = settings.max || 60;
  const name = settings.name || 'default';
  const keyGenerator = settings.keyGenerator || defaultKeyGenerator;

  startCleanup(windowMs * 2);

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const key = name + '|' + keyGenerator(req);
    const windowStart = now - windowMs;

    let hits = buckets.get(key);

    if (!hits) {
      // Simple guard against unbounded growth between cleanup ticks.
      if (buckets.size >= MAX_KEYS) {
        buckets.clear();
        logger.warn('Rate limit table full, cleared', { limiter: name });
      }
      hits = [];
      buckets.set(key, hits);
    }

    // Drop timestamps that have slid out of the window. The array is ascending,
    // so this is a single prefix removal rather than a filter over everything.
    let expired = 0;
    while (expired < hits.length && hits[expired] <= windowStart) {
      expired += 1;
    }
    if (expired) {
      hits.splice(0, expired);
    }

    const remaining = Math.max(0, max - hits.length - 1);
    const resetAt = (hits.length ? hits[0] : now) + windowMs;

    // Standard headers so the client can back off intelligently.
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000));

    if (hits.length >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));

      res.setHeader('Retry-After', retryAfterSeconds);

      logger.warn('Rate limit exceeded', {
        limiter: name,
        key: key,
        path: req.originalUrl,
        hits: hits.length
      });

      next(
        ApiError.tooManyRequests('Too many requests, please slow down', {
          limiter: name,
          retryAfterSeconds: retryAfterSeconds
        })
      );
      return;
    }

    hits.push(now);
    next();
  };
}

/* ------------------------------------------------------------------ */
/* Limiters required by the spec                                       */
/* ------------------------------------------------------------------ */

// Auth routes: 5 requests per minute. Keyed by IP only — keying a login
// attempt by user id would be pointless, since the caller is not signed in yet.
const authLimiter = createRateLimiter({
  name: 'auth',
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: function (req) {
    return 'ip:' + (req.clientIp || req.ip || 'unknown');
  }
});

// Public endpoints: 20 requests per minute.
const publicLimiter = createRateLimiter({
  name: 'public',
  windowMs: 60 * 1000,
  max: 20
});

// Recall endpoints: 30 requests per minute. Recall mode is keyboard-driven and
// fast, so this is the most generous of the three.
const recallLimiter = createRateLimiter({
  name: 'recall',
  windowMs: 60 * 1000,
  max: 30
});

// Everything else. Not required by the spec, but an unlimited default would
// make the three limiters above easy to route around.
const globalLimiter = createRateLimiter({
  name: 'global',
  windowMs: 60 * 1000,
  max: 200
});

/** Test hook — clears all counters. */
function reset() {
  buckets.clear();
}

module.exports = {
  createRateLimiter: createRateLimiter,
  authLimiter: authLimiter,
  publicLimiter: publicLimiter,
  recallLimiter: recallLimiter,
  globalLimiter: globalLimiter,
  reset: reset
};
