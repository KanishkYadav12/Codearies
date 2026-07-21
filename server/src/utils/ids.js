'use strict';

/**
 * ObjectId conversion helpers.
 *
 * Route params and request bodies arrive as strings; the native driver needs
 * real ObjectId instances. Converting in one place keeps `new ObjectId(...)`
 * (which throws on malformed input) out of every model function.
 */

const { ObjectId } = require('mongodb');
const { isValidObjectId } = require('./validators');
const ApiError = require('./ApiError');

/**
 * Converts to ObjectId, throwing a 400 rather than the driver's BSONError when
 * the value is not a valid id. `label` names the field in the error message.
 */
function toObjectId(value, label) {
  if (value instanceof ObjectId) {
    return value;
  }

  if (!isValidObjectId(value)) {
    throw ApiError.badRequest((label || 'id') + ' is not a valid identifier');
  }

  return new ObjectId(String(value));
}

/** Same as toObjectId but returns null instead of throwing. */
function toObjectIdOrNull(value) {
  if (value instanceof ObjectId) {
    return value;
  }
  return isValidObjectId(value) ? new ObjectId(String(value)) : null;
}

/** Maps a list of candidate ids, silently dropping anything malformed. */
function toObjectIdList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(toObjectIdOrNull)
    .filter(function (id) {
      return id !== null;
    });
}

/** De-duplicates a list of ObjectIds by their hex representation. */
function uniqueObjectIds(ids) {
  const seen = new Set();
  const output = [];

  ids.forEach(function (id) {
    const key = id.toHexString();
    if (!seen.has(key)) {
      seen.add(key);
      output.push(id);
    }
  });

  return output;
}

function sameId(a, b) {
  if (!a || !b) {
    return false;
  }
  return String(a) === String(b);
}

module.exports = {
  toObjectId: toObjectId,
  toObjectIdOrNull: toObjectIdOrNull,
  toObjectIdList: toObjectIdList,
  uniqueObjectIds: uniqueObjectIds,
  sameId: sameId
};
