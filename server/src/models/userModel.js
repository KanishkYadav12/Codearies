'use strict';

/**
 * User model — native MongoDB driver only (backend constraint #1).
 *
 * There is no schema object and no ODM. This module *is* the schema: it owns
 * the document shape, the defaults, the validation call and every query that
 * touches the `users` collection. Nothing outside this file writes to it.
 */

const bcrypt = require('bcryptjs');
const connection = require('../db/connection');
const ApiError = require('../utils/ApiError');
const { toObjectId } = require('../utils/ids');
const {
  validateUserFields,
  validatePreferences,
  normalizeEmail,
  normalizeText
} = require('../utils/validators');

// 10 rounds: the usual cost/latency balance for an interactive login on the
// small dynos this deploys to.
const SALT_ROUNDS = 10;

const DEFAULT_PREFERENCES = {
  theme: 'dark',
  defaultVisibility: 'private',
  recallInterval: 24
};

function collection() {
  return connection.getCollection(connection.COLLECTIONS.USERS);
}

/**
 * Builds a complete, defaulted user document. Every field in the spec is
 * present from the moment of insert, so no query has to cope with a missing
 * key on an older document.
 */
function buildUserDocument(fields, passwordHash) {
  const now = new Date();

  return {
    username: normalizeText(fields.username),
    email: normalizeEmail(fields.email),
    password: passwordHash,
    lastLogin: null,
    lastLoginIP: null,
    preferences: {
      theme: DEFAULT_PREFERENCES.theme,
      defaultVisibility: DEFAULT_PREFERENCES.defaultVisibility,
      recallInterval: DEFAULT_PREFERENCES.recallInterval
    },
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Strips the password hash and normalises the id for transport.
 * Every response path goes through this — the hash must never leave the server.
 */
function toPublicUser(document) {
  if (!document) {
    return null;
  }

  return {
    id: String(document._id),
    username: document.username,
    email: document.email,
    lastLogin: document.lastLogin || null,
    lastLoginIP: document.lastLoginIP || null,
    preferences: {
      theme: (document.preferences && document.preferences.theme) || DEFAULT_PREFERENCES.theme,
      defaultVisibility:
        (document.preferences && document.preferences.defaultVisibility) ||
        DEFAULT_PREFERENCES.defaultVisibility,
      recallInterval:
        (document.preferences && document.preferences.recallInterval) ||
        DEFAULT_PREFERENCES.recallInterval
    },
    createdAt: document.createdAt
  };
}

/**
 * Registers a user.
 *
 * Uniqueness is enforced by the unique indexes rather than a read-then-write
 * check: a pre-flight `findOne` races two simultaneous signups for the same
 * email. We let the index reject the loser and translate error 11000 into a
 * clean 409.
 */
function createUser(fields) {
  const problems = validateUserFields(fields);

  if (problems.length) {
    return Promise.reject(ApiError.unprocessable('Invalid registration details', problems));
  }

  return bcrypt
    .hash(fields.password, SALT_ROUNDS)
    .then(function (passwordHash) {
      const document = buildUserDocument(fields, passwordHash);

      return collection()
        .insertOne(document)
        .then(function (result) {
          document._id = result.insertedId;
          return toPublicUser(document);
        });
    })
    .catch(function (error) {
      if (error && error.code === 11000) {
        // keyPattern tells us which unique index rejected the write.
        const field = error.keyPattern && error.keyPattern.username ? 'username' : 'email';
        throw ApiError.conflict('That ' + field + ' is already registered', { field: field });
      }
      throw error;
    });
}

/** Looks up by email *including* the password hash, for login only. */
function findByEmailWithPassword(email) {
  return collection().findOne({ email: normalizeEmail(email) });
}

function findById(id) {
  return collection()
    .findOne({ _id: toObjectId(id, 'userId') })
    .then(toPublicUser);
}

/** Raw document, password included. Used by the auth middleware. */
function findRawById(id) {
  return collection().findOne({ _id: toObjectId(id, 'userId') });
}

function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Session tracking: records when and from where the user last signed in.
 * Returns the updated public user so login can respond with fresh values.
 */
function recordLogin(userId, ipAddress) {
  const now = new Date();

  return collection()
    .findOneAndUpdate(
      { _id: toObjectId(userId, 'userId') },
      {
        $set: {
          lastLogin: now,
          lastLoginIP: ipAddress || null,
          updatedAt: now
        }
      },
      { returnDocument: 'after' }
    )
    .then(function (result) {
      // Driver 6 returns the document directly; older shapes nest it in .value.
      const document = result && result.value ? result.value : result;
      return toPublicUser(document);
    });
}

function updatePreferences(userId, preferences) {
  const problems = validatePreferences(preferences || {});

  if (problems.length) {
    return Promise.reject(ApiError.unprocessable('Invalid preferences', problems));
  }

  const updates = { updatedAt: new Date() };

  // Dot-notation so a partial update never clobbers the sibling preferences.
  ['theme', 'defaultVisibility', 'recallInterval'].forEach(function (key) {
    if (preferences[key] !== undefined) {
      updates['preferences.' + key] = preferences[key];
    }
  });

  if (Object.keys(updates).length === 1) {
    return Promise.reject(ApiError.badRequest('No preference changes supplied'));
  }

  return collection()
    .findOneAndUpdate({ _id: toObjectId(userId, 'userId') }, { $set: updates }, {
      returnDocument: 'after'
    })
    .then(function (result) {
      const document = result && result.value ? result.value : result;

      if (!document) {
        throw ApiError.notFound('User not found');
      }

      return toPublicUser(document);
    });
}

function countAll() {
  return collection().countDocuments();
}

module.exports = {
  createUser: createUser,
  findById: findById,
  findRawById: findRawById,
  findByEmailWithPassword: findByEmailWithPassword,
  verifyPassword: verifyPassword,
  recordLogin: recordLogin,
  updatePreferences: updatePreferences,
  countAll: countAll,
  toPublicUser: toPublicUser,
  DEFAULT_PREFERENCES: DEFAULT_PREFERENCES,
  SALT_ROUNDS: SALT_ROUNDS
};
