'use strict';

/**
 * Hand-written validation primitives (backend constraint #2).
 *
 * Joi guards the *shape of the HTTP request*; these functions guard the *shape
 * of the document* right before it reaches MongoDB. Keeping a second layer here
 * means model functions stay safe when called from the seed script, from a
 * future job, or from anywhere else that never passed through a route.
 *
 * Every predicate is pure and returns a boolean. Composite checks return an
 * array of human-readable problems, empty when the value is acceptable.
 */

const { ObjectId } = require('mongodb');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const USERNAME_PATTERN = /^[a-z0-9_.-]+$/i;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const DROP_TYPES = ['code', 'command', 'link', 'note'];
const VISIBILITIES = ['public', 'private'];
const THEMES = ['light', 'dark'];
const RECALL_TYPES = ['manual', 'scheduled'];

const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
  DROP_TITLE_MAX: 100,
  DROP_CONTENT_MAX: 20000,
  DROP_TAGS_MAX: 5,
  TAG_MAX: 24,
  COLLECTION_NAME_MAX: 60,
  COLLECTION_DESCRIPTION_MAX: 200,
  RECALL_INTERVAL_MIN: 1,
  RECALL_INTERVAL_MAX: 8760, // one year in hours
  CONFIDENCE_MIN: 1,
  CONFIDENCE_MAX: 5
};

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function isString(value) {
  return typeof value === 'string';
}

function isNonEmptyString(value) {
  return isString(value) && value.trim().length > 0;
}

function hasLengthBetween(value, min, max) {
  if (!isString(value)) {
    return false;
  }
  const length = value.trim().length;
  return length >= min && length <= max;
}

function isValidEmail(value) {
  // Bounded before the regex runs: a very long string should be rejected on
  // length rather than handed to a pattern matcher.
  return isNonEmptyString(value) && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

function isValidUsername(value) {
  return (
    hasLengthBetween(value, LIMITS.USERNAME_MIN, LIMITS.USERNAME_MAX) &&
    USERNAME_PATTERN.test(value.trim())
  );
}

function isValidPassword(value) {
  // Not trimmed: leading/trailing spaces are legitimate password characters.
  return isString(value) && value.length >= LIMITS.PASSWORD_MIN && value.length <= LIMITS.PASSWORD_MAX;
}

function isValidHexColor(value) {
  return isNonEmptyString(value) && HEX_COLOR_PATTERN.test(value.trim());
}

function isValidObjectId(value) {
  if (value instanceof ObjectId) {
    return true;
  }
  // ObjectId.isValid() accepts any 12-character string, which lets things like
  // "hello world!" through. Require the 24-char hex form explicitly.
  return isString(value) && /^[0-9a-f]{24}$/i.test(value);
}

function isOneOf(value, allowed) {
  return allowed.indexOf(value) !== -1;
}

function isIntegerBetween(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

/* ------------------------------------------------------------------ */
/* Normalisers                                                         */
/* ------------------------------------------------------------------ */

/** Collapses runs of whitespace and trims. Used on titles and names. */
function normalizeText(value) {
  return isString(value) ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeEmail(value) {
  return isString(value) ? value.trim().toLowerCase() : '';
}

/**
 * Tags are lowercased, stripped of decoration, de-duplicated and capped.
 * Returned in insertion order so the most relevant extracted tag stays first.
 */
function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  const output = [];

  tags.forEach(function (tag) {
    if (!isString(tag)) {
      return;
    }

    const cleaned = tag
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/[^a-z0-9+#._-]/g, '')
      .slice(0, LIMITS.TAG_MAX);

    if (!cleaned || seen.has(cleaned)) {
      return;
    }

    seen.add(cleaned);
    output.push(cleaned);
  });

  return output.slice(0, LIMITS.DROP_TAGS_MAX);
}

/* ------------------------------------------------------------------ */
/* Composite document validators                                       */
/* ------------------------------------------------------------------ */

function validateUserFields(fields) {
  const problems = [];

  if (!isValidUsername(fields.username)) {
    problems.push(
      'username must be ' +
        LIMITS.USERNAME_MIN +
        '-' +
        LIMITS.USERNAME_MAX +
        ' characters using letters, numbers, dot, underscore or hyphen'
    );
  }

  if (!isValidEmail(fields.email)) {
    problems.push('email must be a valid address');
  }

  if (!isValidPassword(fields.password)) {
    problems.push('password must be at least ' + LIMITS.PASSWORD_MIN + ' characters');
  }

  return problems;
}

function validateDropFields(fields, options) {
  const settings = options || {};
  const partial = Boolean(settings.partial);
  const problems = [];

  const has = function (key) {
    return Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined;
  };

  if (!partial || has('title')) {
    if (!isNonEmptyString(fields.title)) {
      problems.push('title is required');
    } else if (normalizeText(fields.title).length > LIMITS.DROP_TITLE_MAX) {
      problems.push('title must be at most ' + LIMITS.DROP_TITLE_MAX + ' characters');
    }
  }

  if (!partial || has('content')) {
    if (!isNonEmptyString(fields.content)) {
      problems.push('content is required');
    } else if (fields.content.length > LIMITS.DROP_CONTENT_MAX) {
      problems.push('content must be at most ' + LIMITS.DROP_CONTENT_MAX + ' characters');
    }
  }

  if (has('type') && !isOneOf(fields.type, DROP_TYPES)) {
    problems.push('type must be one of ' + DROP_TYPES.join(', '));
  }

  if (has('visibility') && !isOneOf(fields.visibility, VISIBILITIES)) {
    problems.push('visibility must be one of ' + VISIBILITIES.join(', '));
  }

  if (has('tags')) {
    if (!Array.isArray(fields.tags)) {
      problems.push('tags must be an array');
    } else if (fields.tags.length > LIMITS.DROP_TAGS_MAX) {
      problems.push('a drop can carry at most ' + LIMITS.DROP_TAGS_MAX + ' tags');
    }
  }

  if (has('language') && fields.language !== null && !isNonEmptyString(fields.language)) {
    problems.push('language must be a non-empty string when provided');
  }

  if (has('isFavorite') && typeof fields.isFavorite !== 'boolean') {
    problems.push('isFavorite must be a boolean');
  }

  return problems;
}

function validateCollectionFields(fields, options) {
  const settings = options || {};
  const partial = Boolean(settings.partial);
  const problems = [];

  const has = function (key) {
    return Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined;
  };

  if (!partial || has('name')) {
    if (!isNonEmptyString(fields.name)) {
      problems.push('name is required');
    } else if (normalizeText(fields.name).length > LIMITS.COLLECTION_NAME_MAX) {
      problems.push('name must be at most ' + LIMITS.COLLECTION_NAME_MAX + ' characters');
    }
  }

  if (has('description') && fields.description !== null) {
    if (!isString(fields.description)) {
      problems.push('description must be a string');
    } else if (fields.description.trim().length > LIMITS.COLLECTION_DESCRIPTION_MAX) {
      problems.push(
        'description must be at most ' + LIMITS.COLLECTION_DESCRIPTION_MAX + ' characters'
      );
    }
  }

  if (has('color') && !isValidHexColor(fields.color)) {
    problems.push('color must be a hex code such as #38bdf8');
  }

  if (has('isShared') && typeof fields.isShared !== 'boolean') {
    problems.push('isShared must be a boolean');
  }

  return problems;
}

function validatePreferences(preferences) {
  const problems = [];

  const has = function (key) {
    return (
      Object.prototype.hasOwnProperty.call(preferences, key) && preferences[key] !== undefined
    );
  };

  if (has('theme') && !isOneOf(preferences.theme, THEMES)) {
    problems.push('theme must be one of ' + THEMES.join(', '));
  }

  if (has('defaultVisibility') && !isOneOf(preferences.defaultVisibility, VISIBILITIES)) {
    problems.push('defaultVisibility must be one of ' + VISIBILITIES.join(', '));
  }

  if (
    has('recallInterval') &&
    !isIntegerBetween(
      preferences.recallInterval,
      LIMITS.RECALL_INTERVAL_MIN,
      LIMITS.RECALL_INTERVAL_MAX
    )
  ) {
    problems.push(
      'recallInterval must be a whole number of hours between ' +
        LIMITS.RECALL_INTERVAL_MIN +
        ' and ' +
        LIMITS.RECALL_INTERVAL_MAX
    );
  }

  return problems;
}

module.exports = {
  // primitives
  isString: isString,
  isNonEmptyString: isNonEmptyString,
  hasLengthBetween: hasLengthBetween,
  isValidEmail: isValidEmail,
  isValidUsername: isValidUsername,
  isValidPassword: isValidPassword,
  isValidHexColor: isValidHexColor,
  isValidObjectId: isValidObjectId,
  isOneOf: isOneOf,
  isIntegerBetween: isIntegerBetween,
  isValidDate: isValidDate,

  // normalisers
  normalizeText: normalizeText,
  normalizeEmail: normalizeEmail,
  normalizeTags: normalizeTags,

  // composites
  validateUserFields: validateUserFields,
  validateDropFields: validateDropFields,
  validateCollectionFields: validateCollectionFields,
  validatePreferences: validatePreferences,

  // shared vocabulary
  DROP_TYPES: DROP_TYPES,
  VISIBILITIES: VISIBILITIES,
  THEMES: THEMES,
  RECALL_TYPES: RECALL_TYPES,
  LIMITS: LIMITS
};
