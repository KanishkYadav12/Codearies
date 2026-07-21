'use strict';

/**
 * Query construction for the explorer, and related-drop discovery.
 *
 * Kept out of the models so the filter vocabulary lives in exactly one place:
 * the authenticated explorer, the public feed and the collection views all
 * build their `$match` stages through these helpers.
 */

const { toObjectIdOrNull } = require('../utils/ids');
const { normalizeTags, DROP_TYPES, VISIBILITIES } = require('../utils/validators');

const SORT_OPTIONS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  recalled: { recallCount: -1, lastRecalled: -1, _id: -1 },
  alphabetical: { title: 1, _id: 1 },
  updated: { updatedAt: -1, _id: -1 },
  due: { nextRecallDate: 1, _id: 1 }
};

const DEFAULT_SORT = 'newest';

/**
 * Escapes a user-supplied string for safe use inside a RegExp.
 *
 * Without this a search for "c++" or "a{1,9999}" becomes either a syntax error
 * or a catastrophic-backtracking DoS against the API process.
 */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Translates validated query params into a MongoDB filter document.
 *
 * `options.owner`  - restrict to a user's own drops (explorer, my drops)
 * `options.publicOnly` - restrict to public drops (unauthenticated feed)
 */
function buildDropFilter(query, options) {
  const params = query || {};
  const settings = options || {};
  const filter = {};
  const conditions = [];

  if (settings.owner) {
    filter.createdBy = settings.owner;
  }

  if (settings.publicOnly) {
    filter.visibility = 'public';
  } else if (params.visibility && VISIBILITIES.indexOf(params.visibility) !== -1) {
    filter.visibility = params.visibility;
  }

  if (params.type && DROP_TYPES.indexOf(params.type) !== -1) {
    filter.type = params.type;
  }

  if (params.language) {
    filter.language = String(params.language).toLowerCase();
  }

  if (params.tag) {
    const tags = normalizeTags(String(params.tag).split(','));
    if (tags.length === 1) {
      filter.tags = tags[0];
    } else if (tags.length > 1) {
      // Multiple tags narrow the result set rather than widening it.
      filter.tags = { $all: tags };
    }
  }

  if (params.favorite === true || params.favorite === 'true') {
    filter.isFavorite = true;
  }

  if (params.due === true || params.due === 'true') {
    filter.nextRecallDate = { $lte: new Date() };
  }

  if (params.mastered === true || params.mastered === 'true') {
    filter.recallCount = { $gte: 5 };
  }

  if (params.collectionId) {
    const collectionId = toObjectIdOrNull(params.collectionId);
    if (collectionId) {
      // Resolved by the caller into a list of ids; see dropModel.listForUser.
      filter.__collectionId = collectionId;
    }
  }

  const term = typeof params.search === 'string' ? params.search.trim() : '';

  if (term) {
    // Regex rather than $text: the explorer needs prefix/substring matching as
    // the user types, which a text index cannot do. The fields are individually
    // indexed and the result set is scoped to one owner, so this stays cheap.
    const pattern = new RegExp(escapeRegex(term), 'i');
    conditions.push({
      $or: [{ title: pattern }, { content: pattern }, { tags: pattern }]
    });
  }

  if (conditions.length) {
    filter.$and = conditions;
  }

  return filter;
}

function buildSort(sortKey) {
  const key = typeof sortKey === 'string' ? sortKey.toLowerCase() : DEFAULT_SORT;
  return SORT_OPTIONS[key] || SORT_OPTIONS[DEFAULT_SORT];
}

/**
 * Normalises pagination input. The spec fixes the page size at 8; we allow a
 * bounded override so the grid view can request a fuller page.
 */
function buildPagination(query, defaultLimit) {
  const params = query || {};
  const fallback = defaultLimit || 8;

  const page = Math.max(1, Number.parseInt(params.page, 10) || 1);
  const requested = Number.parseInt(params.limit, 10) || fallback;
  const limit = Math.min(Math.max(requested, 1), 50);

  return {
    page: page,
    limit: limit,
    skip: (page - 1) * limit
  };
}

function buildPageMeta(total, pagination) {
  const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

  return {
    page: pagination.page,
    limit: pagination.limit,
    total: total,
    totalPages: totalPages,
    hasMore: pagination.page < totalPages
  };
}

/**
 * Aggregation pipeline scoring how related other drops are to a reference drop.
 *
 * Scoring, highest weight first:
 *   - shared tags        (3 points each) — the strongest signal
 *   - same language      (2 points)
 *   - same type          (1 point)
 *   - title keyword hit  (2 points each)
 *
 * `$setIntersection` does the tag overlap inside the database, so we never pull
 * the user's whole drop set into Node to compare it.
 */
function buildRelatedPipeline(drop, options) {
  const settings = options || {};
  const limit = settings.limit || 5;
  const tags = Array.isArray(drop.tags) ? drop.tags : [];

  // Distinctive words from the title, used as a secondary signal when the drop
  // has few or no tags.
  const keywords = String(drop.title || '')
    .toLowerCase()
    .split(/[^a-z0-9+#._-]+/)
    .filter(function (word) {
      return word.length > 3;
    })
    .slice(0, 6);

  const match = {
    createdBy: drop.createdBy,
    _id: { $ne: drop._id }
  };

  // Only consider drops that could plausibly score: a tag in common, the same
  // language, or a title keyword. Without this the pipeline scores every drop
  // the user owns on every create.
  const candidateConditions = [];

  if (tags.length) {
    candidateConditions.push({ tags: { $in: tags } });
  }

  if (drop.language) {
    candidateConditions.push({ language: drop.language });
  }

  keywords.forEach(function (word) {
    candidateConditions.push({ title: new RegExp(escapeRegex(word), 'i') });
  });

  if (candidateConditions.length) {
    match.$or = candidateConditions;
  }

  const titleScore = keywords.length
    ? {
        $sum: keywords.map(function (word) {
          return {
            $cond: [
              { $regexMatch: { input: { $toLower: '$title' }, regex: escapeRegex(word) } },
              2,
              0
            ]
          };
        })
      }
    : 0;

  return [
    { $match: match },
    {
      $addFields: {
        sharedTags: {
          $size: { $setIntersection: [{ $ifNull: ['$tags', []] }, tags] }
        }
      }
    },
    {
      $addFields: {
        relevance: {
          $add: [
            { $multiply: ['$sharedTags', 3] },
            { $cond: [{ $eq: ['$language', drop.language || null] }, 2, 0] },
            { $cond: [{ $eq: ['$type', drop.type] }, 1, 0] },
            titleScore
          ]
        }
      }
    },
    // A candidate that matched only on "same type" is not worth suggesting.
    { $match: { relevance: { $gte: 2 } } },
    { $sort: { relevance: -1, recallCount: -1, createdAt: -1 } },
    { $limit: limit },
    {
      $project: {
        title: 1,
        type: 1,
        language: 1,
        tags: 1,
        visibility: 1,
        recallCount: 1,
        createdAt: 1,
        relevance: 1,
        sharedTags: 1
      }
    }
  ];
}

module.exports = {
  buildDropFilter: buildDropFilter,
  buildSort: buildSort,
  buildPagination: buildPagination,
  buildPageMeta: buildPageMeta,
  buildRelatedPipeline: buildRelatedPipeline,
  escapeRegex: escapeRegex,
  SORT_OPTIONS: SORT_OPTIONS
};
