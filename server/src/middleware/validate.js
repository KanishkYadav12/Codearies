'use strict';

/**
 * Request validation with Joi (the one validation library the spec permits).
 *
 * Strict by design:
 *   - `abortEarly: false`  report every problem at once, not one per round trip
 *   - `convert: true`      query strings arrive as text and must be coerced
 *   - unknown keys are **rejected**, not stripped. Silently dropping an
 *     unrecognised field hides client bugs and lets a typo'd `visiblity` look
 *     like a successful update that changed nothing.
 *
 * Validated output replaces the raw input, so handlers always read coerced,
 * defaulted values rather than raw strings.
 */

const Joi = require('joi');
const ApiError = require('../utils/ApiError');
const { DROP_TYPES, VISIBILITIES, THEMES, LIMITS } = require('../utils/validators');

const OPTIONS = {
  abortEarly: false,
  convert: true,
  allowUnknown: false,
  stripUnknown: false
};

/**
 * Builds middleware validating one part of the request.
 * `source` is 'body', 'query' or 'params'.
 */
function validate(schema, source) {
  const target = source || 'body';

  return function validationMiddleware(req, res, next) {
    const result = schema.validate(req[target] || {}, OPTIONS);

    if (result.error) {
      const details = result.error.details.map(function (detail) {
        return {
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, '')
        };
      });

      next(ApiError.unprocessable('Validation failed', details));
      return;
    }

    // Express 5 makes req.query a getter; assigning to a property of the
    // existing object is safe where replacing the object is not.
    if (target === 'query') {
      Object.keys(result.value).forEach(function (key) {
        req.query[key] = result.value[key];
      });
    } else {
      req[target] = result.value;
    }

    next();
  };
}

/* ------------------------------------------------------------------ */
/* Reusable fragments                                                  */
/* ------------------------------------------------------------------ */

const objectId = Joi.string()
  .pattern(/^[0-9a-f]{24}$/i)
  .message('must be a valid id');

const idParam = Joi.object({
  id: objectId.required()
});

const tagList = Joi.array()
  .items(Joi.string().trim().lowercase().max(LIMITS.TAG_MAX))
  .max(LIMITS.DROP_TAGS_MAX)
  .messages({
    'array.max': 'a drop can carry at most ' + LIMITS.DROP_TAGS_MAX + ' tags'
  });

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(8)
};

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

const registerSchema = Joi.object({
  username: Joi.string()
    .trim()
    .min(LIMITS.USERNAME_MIN)
    .max(LIMITS.USERNAME_MAX)
    .pattern(/^[a-zA-Z0-9_.-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'may only contain letters, numbers, dot, underscore or hyphen'
    }),
  email: Joi.string().trim().lowercase().email().max(254).required(),
  password: Joi.string().min(LIMITS.PASSWORD_MIN).max(LIMITS.PASSWORD_MAX).required(),
  // Optional server-side, but validated when the client sends it so the two
  // fields cannot disagree.
  confirmPassword: Joi.string().valid(Joi.ref('password')).messages({
    'any.only': 'must match password'
  })
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
  rememberMe: Joi.boolean().default(false)
});

const preferencesSchema = Joi.object({
  theme: Joi.string().valid(...THEMES),
  defaultVisibility: Joi.string().valid(...VISIBILITIES),
  recallInterval: Joi.number()
    .integer()
    .min(LIMITS.RECALL_INTERVAL_MIN)
    .max(LIMITS.RECALL_INTERVAL_MAX)
})
  .min(1)
  .messages({ 'object.min': 'supply at least one preference to update' });

/* ------------------------------------------------------------------ */
/* Drops                                                               */
/* ------------------------------------------------------------------ */

const createDropSchema = Joi.object({
  title: Joi.string().trim().min(1).max(LIMITS.DROP_TITLE_MAX).required(),
  content: Joi.string().min(1).max(LIMITS.DROP_CONTENT_MAX).required(),
  // Omitted on purpose by the client when it wants auto-categorisation.
  type: Joi.string().valid(...DROP_TYPES),
  language: Joi.string().trim().lowercase().max(30).allow('', null),
  tags: tagList,
  visibility: Joi.string().valid(...VISIBILITIES),
  isFavorite: Joi.boolean(),
  relatedDrops: Joi.array().items(objectId).max(20),
  collectionId: objectId
});

const updateDropSchema = Joi.object({
  title: Joi.string().trim().min(1).max(LIMITS.DROP_TITLE_MAX),
  content: Joi.string().min(1).max(LIMITS.DROP_CONTENT_MAX),
  type: Joi.string().valid(...DROP_TYPES),
  language: Joi.string().trim().lowercase().max(30).allow('', null),
  tags: tagList,
  visibility: Joi.string().valid(...VISIBILITIES),
  isFavorite: Joi.boolean()
})
  .min(1)
  .messages({ 'object.min': 'supply at least one field to update' });

const dropQuerySchema = Joi.object({
  page: pagination.page,
  limit: pagination.limit,
  type: Joi.string().valid(...DROP_TYPES),
  tag: Joi.string().trim().max(120),
  language: Joi.string().trim().lowercase().max(30),
  visibility: Joi.string().valid(...VISIBILITIES),
  search: Joi.string().trim().max(200).allow(''),
  sort: Joi.string()
    .valid('newest', 'oldest', 'recalled', 'alphabetical', 'updated', 'due')
    .default('newest'),
  favorite: Joi.boolean(),
  due: Joi.boolean(),
  mastered: Joi.boolean(),
  collectionId: objectId
});

const recallSchema = Joi.object({
  confidence: Joi.number().integer().min(LIMITS.CONFIDENCE_MIN).max(LIMITS.CONFIDENCE_MAX),
  recallType: Joi.string().valid('manual', 'scheduled').default('manual')
});

const relateSchema = Joi.object({
  relatedDropId: objectId.required()
});

const bulkSchema = Joi.object({
  dropIds: Joi.array().items(objectId).min(1).max(100).required(),
  action: Joi.string().valid('delete', 'visibility', 'favorite', 'collection').required(),
  // Conditional payload: each action needs a different field, and requiring the
  // right one here means the model never has to re-check.
  visibility: Joi.string()
    .valid(...VISIBILITIES)
    .when('action', { is: 'visibility', then: Joi.required() }),
  isFavorite: Joi.boolean().when('action', { is: 'favorite', then: Joi.required() }),
  collectionId: objectId.when('action', { is: 'collection', then: Joi.required() })
});

const recallQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(20)
});

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

const hexColor = Joi.string()
  .pattern(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .message('must be a hex colour such as #38bdf8');

const createCollectionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(LIMITS.COLLECTION_NAME_MAX).required(),
  description: Joi.string().trim().max(LIMITS.COLLECTION_DESCRIPTION_MAX).allow(''),
  color: hexColor
});

const updateCollectionSchema = Joi.object({
  name: Joi.string().trim().min(1).max(LIMITS.COLLECTION_NAME_MAX),
  description: Joi.string().trim().max(LIMITS.COLLECTION_DESCRIPTION_MAX).allow(''),
  color: hexColor,
  isShared: Joi.boolean()
})
  .min(1)
  .messages({ 'object.min': 'supply at least one field to update' });

const addDropToCollectionSchema = Joi.object({
  dropId: objectId.required()
});

const collectionDropParamsSchema = Joi.object({
  id: objectId.required(),
  dropId: objectId.required()
});

/* ------------------------------------------------------------------ */
/* Public                                                              */
/* ------------------------------------------------------------------ */

const publicQuerySchema = Joi.object({
  page: pagination.page,
  limit: pagination.limit,
  type: Joi.string().valid(...DROP_TYPES),
  tag: Joi.string().trim().max(120),
  language: Joi.string().trim().lowercase().max(30),
  search: Joi.string().trim().max(200).allow(''),
  sort: Joi.string().valid('newest', 'oldest', 'recalled', 'alphabetical').default('newest')
});

const shareTokenParamsSchema = Joi.object({
  token: Joi.string()
    .pattern(/^[0-9a-f]{32}$/i)
    .required()
    .messages({ 'string.pattern.base': 'is not a valid share token' })
});

module.exports = {
  validate: validate,

  schemas: {
    idParam: idParam,

    register: registerSchema,
    login: loginSchema,
    preferences: preferencesSchema,

    createDrop: createDropSchema,
    updateDrop: updateDropSchema,
    dropQuery: dropQuerySchema,
    recall: recallSchema,
    recallQuery: recallQuerySchema,
    relate: relateSchema,
    bulk: bulkSchema,

    createCollection: createCollectionSchema,
    updateCollection: updateCollectionSchema,
    addDropToCollection: addDropToCollectionSchema,
    collectionDropParams: collectionDropParamsSchema,

    publicQuery: publicQuerySchema,
    shareTokenParams: shareTokenParamsSchema
  }
};
