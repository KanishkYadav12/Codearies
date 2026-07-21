'use strict';

/**
 * Environment validation.
 *
 * Deployment constraint #3: environment variables must be validated on startup
 * and the process must throw if something required is missing. We do that here,
 * at require-time, so nothing else in the app can observe a half-configured
 * process. Every consumer reads from the frozen object this module exports
 * rather than touching `process.env` directly.
 */

require('dotenv').config();

/**
 * Declarative description of every variable the server understands.
 *
 * required  - boolean, boot fails when absent
 * fallback  - value used when the variable is absent and not required
 * parse     - turns the raw string into its typed value
 * check     - returns an error string when the parsed value is unusable
 */
const SCHEMA = {
  NODE_ENV: {
    required: false,
    fallback: 'development',
    check: function (value) {
      const allowed = ['development', 'test', 'production'];
      if (allowed.indexOf(value) === -1) {
        return 'must be one of ' + allowed.join(', ');
      }
      return null;
    }
  },

  PORT: {
    required: false,
    fallback: 5000,
    parse: function (raw) {
      return Number.parseInt(raw, 10);
    },
    check: function (value) {
      if (!Number.isInteger(value) || value <= 0 || value > 65535) {
        return 'must be an integer between 1 and 65535';
      }
      return null;
    }
  },

  MONGODB_URI: {
    required: true,
    check: function (value) {
      if (!/^mongodb(\+srv)?:\/\//.test(value)) {
        return 'must start with mongodb:// or mongodb+srv://';
      }
      return null;
    }
  },

  MONGODB_DB_NAME: {
    required: false,
    fallback: 'devdrops',
    check: function (value) {
      // Mongo forbids these characters in database names.
      if (!value || /[ .$/\\"*<>:|?]/.test(value)) {
        return 'is not a valid MongoDB database name';
      }
      return null;
    }
  },

  JWT_SECRET: {
    required: true,
    check: function (value) {
      if (value.length < 32) {
        return 'must be at least 32 characters (use `openssl rand -hex 48`)';
      }
      return null;
    }
  },

  JWT_EXPIRES_IN: {
    required: false,
    fallback: '7d',
    check: function (value) {
      if (!/^\d+[smhd]$/.test(value)) {
        return 'must look like 30m, 12h or 7d';
      }
      return null;
    }
  },

  CLIENT_ORIGIN: {
    required: false,
    // Fallbacks bypass `parse` (see loadEnv below), so this must already be
    // in the shape `parse` would produce - an array, not the raw string. A
    // string fallback here previously worked only by accident, because
    // Array.prototype.indexOf and String.prototype.indexOf both exist and a
    // substring search of a single-origin string happens to agree with an
    // array membership check for an exact match.
    fallback: ['http://localhost:5173'],
    parse: function (raw) {
      return raw
        .split(',')
        .map(function (origin) {
          return origin.trim();
        })
        .filter(Boolean);
    },
    check: function (value) {
      if (!value.length) {
        return 'must list at least one origin';
      }
      return null;
    }
  },

  LOG_LEVEL: {
    required: false,
    fallback: 'info',
    check: function (value) {
      const allowed = ['error', 'warn', 'info', 'debug'];
      if (allowed.indexOf(value) === -1) {
        return 'must be one of ' + allowed.join(', ');
      }
      return null;
    }
  },

  PUBLIC_APP_URL: {
    required: false,
    fallback: 'http://localhost:5173',
    check: function (value) {
      if (!/^https?:\/\//.test(value)) {
        return 'must be an http(s) URL';
      }
      return null;
    }
  }
};

/**
 * Validates the whole schema and collects *every* problem before throwing, so a
 * misconfigured deployment surfaces all of its issues in one boot attempt
 * instead of one per restart.
 */
function loadEnv() {
  const config = {};
  const problems = [];

  Object.keys(SCHEMA).forEach(function (key) {
    const rule = SCHEMA[key];
    const raw = process.env[key];
    const isAbsent = raw === undefined || raw === null || String(raw).trim() === '';

    if (isAbsent) {
      if (rule.required) {
        problems.push(key + ' is required but was not set');
        return;
      }
      config[key] = rule.fallback;
      return;
    }

    const value = rule.parse ? rule.parse(String(raw).trim()) : String(raw).trim();
    const failure = rule.check ? rule.check(value) : null;

    if (failure) {
      problems.push(key + ' ' + failure);
      return;
    }

    config[key] = value;
  });

  if (problems.length) {
    const message =
      'Invalid environment configuration:\n' +
      problems
        .map(function (problem) {
          return '  - ' + problem;
        })
        .join('\n') +
      '\n\nSee server/.env.example for the full list of supported variables.';

    throw new Error(message);
  }

  config.isProduction = config.NODE_ENV === 'production';
  config.isTest = config.NODE_ENV === 'test';

  return Object.freeze(config);
}

module.exports = loadEnv();
