'use strict';

/**
 * Operational error type.
 *
 * Distinguishes *expected* failures (bad input, missing document, forbidden)
 * from genuine bugs. The global error handler leaks messages to the client only
 * when `isOperational` is true; everything else becomes a generic 500 so an
 * unexpected stack trace never reaches a browser.
 */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);

    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = true;

    if (details !== undefined) {
      this.details = details;
    }

    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, details) {
    return new ApiError(400, message || 'Bad request', details);
  }

  static unauthorized(message) {
    return new ApiError(401, message || 'Authentication required');
  }

  static forbidden(message) {
    return new ApiError(403, message || 'You do not have access to this resource');
  }

  static notFound(message) {
    return new ApiError(404, message || 'Resource not found');
  }

  static conflict(message, details) {
    return new ApiError(409, message || 'Resource already exists', details);
  }

  static unprocessable(message, details) {
    return new ApiError(422, message || 'Validation failed', details);
  }

  static tooManyRequests(message, details) {
    return new ApiError(429, message || 'Too many requests', details);
  }

  static internal(message) {
    return new ApiError(500, message || 'Something went wrong');
  }
}

module.exports = ApiError;
