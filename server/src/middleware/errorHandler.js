'use strict';

/**
 * Global error handling.
 *
 * Every failure in the app funnels through here, which is what lets controllers
 * stay a single `.catch(next)` and never build an error response by hand.
 *
 * The central rule: only *operational* errors (ApiError) describe themselves to
 * the client. Anything else is a bug, so it is logged in full and reported as a
 * generic 500 — an unexpected stack trace in a response body is an information
 * leak, not a debugging aid.
 */

const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger').child('error');

/** Recognises the framework/driver errors worth translating into clean 4xx. */
function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }

  // Duplicate key from a unique index that a model did not already translate.
  if (error && error.code === 11000) {
    const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
    return ApiError.conflict('That ' + field + ' is already taken', { field: field });
  }

  // Malformed ObjectId that reached the driver.
  if (error && (error.name === 'BSONError' || error.name === 'BSONTypeError')) {
    return ApiError.badRequest('Malformed identifier');
  }

  // express.json() rejecting an unparseable body.
  if (error && error.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  if (error && error.type === 'entity.too.large') {
    return ApiError.badRequest('Request body is too large');
  }

  // Thrown by the CORS check in app.js.
  if (error && error.message === 'CORS_NOT_ALLOWED') {
    return ApiError.forbidden('Origin not permitted by CORS policy');
  }

  return null;
}

/** 404 for unmatched routes. Registered after all routers. */
function notFoundHandler(req, res, next) {
  next(ApiError.notFound('Route ' + req.method + ' ' + req.originalUrl + ' does not exist'));
}

// Express identifies an error handler by its arity, so all four parameters must
// stay declared even though `next` is unused on the success path.
// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const normalized = normalizeError(error);
  const isOperational = Boolean(normalized);
  const statusCode = normalized ? normalized.statusCode : 500;

  const logMeta = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status: statusCode,
    userId: req.user ? req.user.id : null
  };

  if (isOperational) {
    // Expected failures are warnings, not errors — a 404 is not an incident.
    logger.warn(normalized.message, logMeta);
  } else {
    logger.error('Unhandled error: ' + (error && error.message),
      Object.assign({ error: error }, logMeta));
  }

  // The response may already be streaming; hand off to Express's default
  // handler, which will destroy the socket.
  if (res.headersSent) {
    next(error);
    return;
  }

  const body = {
    success: false,
    error: {
      message: isOperational ? normalized.message : 'Something went wrong on our side',
      status: statusCode,
      requestId: req.id
    }
  };

  if (isOperational && normalized.details !== undefined) {
    body.error.details = normalized.details;
  }

  // Stack traces only outside production, and only for genuine bugs.
  if (!env.isProduction && !isOperational && error && error.stack) {
    body.error.stack = error.stack.split('\n');
  }

  res.status(statusCode).json(body);
}

/**
 * Wraps a promise-returning handler so a rejection reaches `next` without every
 * controller repeating `.catch(next)`.
 *
 * Express 4 does not forward rejected promises from handlers; Express 5 will.
 * Controllers here call `.catch(next)` explicitly for clarity, but this stays
 * available for the terser routes.
 */
function catchErrors(handler) {
  return function wrappedHandler(req, res, next) {
    try {
      const result = handler(req, res, next);

      if (result && typeof result.then === 'function') {
        result.catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  errorHandler: errorHandler,
  notFoundHandler: notFoundHandler,
  catchErrors: catchErrors
};
