'use strict';

/**
 * Custom logging utility (backend constraint #5).
 *
 * Deliberately dependency-free: level filtering, timestamps, ANSI colouring for
 * a TTY, structured metadata, and child loggers that carry a scope prefix.
 * In production we emit newline-delimited JSON instead of pretty text so log
 * aggregators on Render/Railway can parse it without a custom grok pattern.
 */

const env = require('../config/env');

// Lower number == higher severity. A message is emitted when its level is at or
// above the configured threshold.
const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const COLORS = {
  error: '[31m', // red
  warn: '[33m', // yellow
  info: '[36m', // cyan
  debug: '[90m', // grey
  scope: '[35m', // magenta
  reset: '[0m'
};

const threshold = LEVELS[env.LOG_LEVEL] === undefined ? LEVELS.info : LEVELS[env.LOG_LEVEL];
const useColor = Boolean(process.stdout.isTTY) && !env.isProduction;

function timestamp() {
  return new Date().toISOString();
}

function paint(color, text) {
  return useColor ? color + text + COLORS.reset : text;
}

/**
 * Errors do not survive JSON.stringify (name/message/stack are non-enumerable),
 * so unwrap them explicitly wherever they appear in the metadata object.
 */
function normalizeMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  if (meta instanceof Error) {
    return { error: { name: meta.name, message: meta.message, stack: meta.stack } };
  }

  const output = {};
  Object.keys(meta).forEach(function (key) {
    const value = meta[key];
    output[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  });

  return Object.keys(output).length ? output : null;
}

function formatMeta(meta) {
  try {
    return JSON.stringify(meta);
  } catch (serializationError) {
    // Circular references shouldn't take the process down over a log line.
    return '[unserializable metadata: ' + serializationError.message + ']';
  }
}

function write(level, scope, message, meta) {
  if (LEVELS[level] > threshold) {
    return;
  }

  const normalized = normalizeMeta(meta);
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

  if (env.isProduction) {
    const record = {
      timestamp: timestamp(),
      level: level,
      scope: scope || 'app',
      message: message
    };
    if (normalized) {
      record.meta = normalized;
    }
    stream.write(formatMeta(record) + '\n');
    return;
  }

  const parts = [
    paint(COLORS.debug, timestamp()),
    paint(COLORS[level], level.toUpperCase().padEnd(5)),
    scope ? paint(COLORS.scope, '[' + scope + ']') : null,
    message
  ].filter(Boolean);

  if (normalized) {
    parts.push(paint(COLORS.debug, formatMeta(normalized)));
  }

  stream.write(parts.join(' ') + '\n');
}

/**
 * Builds a logger bound to a scope. `logger.child('drops')` produces lines
 * tagged `[drops]`, which keeps controller/service output greppable.
 */
function createLogger(scope) {
  const logger = {
    child: function (childScope) {
      return createLogger(scope ? scope + ':' + childScope : childScope);
    }
  };

  Object.keys(LEVELS).forEach(function (level) {
    logger[level] = function (message, meta) {
      write(level, scope, message, meta);
    };
  });

  return logger;
}

const rootLogger = createLogger(null);

rootLogger.createLogger = createLogger;
rootLogger.LEVELS = LEVELS;

module.exports = rootLogger;
