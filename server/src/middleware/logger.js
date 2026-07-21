'use strict';

/**
 * Request logging middleware.
 *
 * The spec asks for timestamp, method, path and IP. We log those on the way in
 * and, on the way out, the status code and duration — a request log without
 * outcomes cannot answer "which endpoint is slow" or "what started 500ing".
 *
 * Each request also gets a short id, echoed in the `X-Request-Id` response
 * header and attached to any error the handler logs, so a user-reported failure
 * can be traced to one line in the log.
 */

const crypto = require('crypto');
const logger = require('../utils/logger').child('http');

// Paths that would otherwise flood the log. Health checks in particular are
// hit every few seconds by Render/Railway.
const QUIET_PATHS = new Set(['/api/health', '/health', '/favicon.ico']);

// Never log the contents of these, even in debug.
const SENSITIVE_FIELDS = new Set(['password', 'confirmPassword', 'token', 'authorization']);

/**
 * Resolves the real client IP.
 *
 * Behind Render/Railway/nginx the socket address is the proxy, so the left-most
 * entry of `X-Forwarded-For` is the originating client. Express only honours
 * that header when `trust proxy` is enabled, which app.js sets in production.
 */
function resolveClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }

  // Strip the IPv4-mapped IPv6 prefix so logs read 127.0.0.1, not ::ffff:127.0.0.1
  const address = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

  return String(address).replace(/^::ffff:/, '');
}

/** Shallow copy of the body with secrets masked, for debug-level logging. */
function redactBody(body) {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const output = {};

  Object.keys(body).forEach(function (key) {
    output[key] = SENSITIVE_FIELDS.has(key.toLowerCase()) ? '[redacted]' : body[key];
  });

  return output;
}

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();

  req.id = crypto.randomBytes(6).toString('hex');
  req.clientIp = resolveClientIp(req);

  res.setHeader('X-Request-Id', req.id);

  const isQuiet = QUIET_PATHS.has(req.path);

  if (!isQuiet) {
    logger.info(req.method + ' ' + req.originalUrl, {
      requestId: req.id,
      ip: req.clientIp,
      userAgent: req.headers['user-agent']
    });

    // Bodies only at debug level, and only with secrets stripped.
    if (req.body && Object.keys(req.body).length) {
      logger.debug('Request body', { requestId: req.id, body: redactBody(req.body) });
    }
  }

  // `finish` fires once the response is flushed, which is where the real
  // duration and the final status code become known.
  res.on('finish', function () {
    if (isQuiet && res.statusCode < 400) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const meta = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      ip: req.clientIp,
      userId: req.user ? req.user.id : null
    };

    const message =
      req.method + ' ' + req.originalUrl + ' -> ' + res.statusCode + ' (' + meta.durationMs + 'ms)';

    if (res.statusCode >= 500) {
      logger.error(message, meta);
    } else if (res.statusCode >= 400) {
      logger.warn(message, meta);
    } else {
      logger.info(message, meta);
    }
  });

  next();
}

module.exports = {
  requestLogger: requestLogger,
  resolveClientIp: resolveClientIp
};
