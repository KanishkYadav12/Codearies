'use strict';

/**
 * Seed script (database constraint #2).
 *
 * Generates a realistic dataset — not lorem ipsum. Every drop is a snippet a
 * developer would plausibly save, which matters because the auto-categoriser,
 * the tag extractor and the related-drop scorer are all content-driven: seeding
 * with placeholder text would exercise none of them.
 *
 * What it builds:
 *   - 2 users with known credentials
 *   - ~24 drops spanning all four types and several languages
 *   - collections, one of them shared with a live token
 *   - a back-dated recall history that produces a real multi-day streak and a
 *     spread of mastered / due / not-yet-due drops
 *
 * Usage:
 *   npm run seed              append to whatever is there
 *   npm run seed -- --fresh   wipe the collections first
 */

const connection = require('../db/connection');
const { syncSchema } = require('../db/indexes');
const userModel = require('../models/userModel');
const tagService = require('../services/tagService');
const recallService = require('../services/recallService');
const logger = require('../utils/logger').child('seed');

const { COLLECTIONS } = connection;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SEED_USERS = [
  {
    username: 'devdrops',
    email: 'demo@devdrops.dev',
    password: 'demo1234',
    label: 'primary demo account'
  },
  {
    username: 'kanishk',
    email: 'kanishk@devdrops.dev',
    password: 'kanishk1234',
    label: 'secondary account, used to prove ownership isolation'
  }
];

/**
 * Content library. `daysAgo` back-dates creation so the dashboard has history
 * on first load, and `recalls` drives how far up the Fibonacci ladder the drop
 * has climbed — which is what makes some drops mastered and others overdue.
 */
const DROP_LIBRARY = [
  {
    title: 'Reset a file to the last commit',
    content: '$ git checkout -- path/to/file.js\n\n# Discard *all* local changes:\n$ git reset --hard HEAD',
    visibility: 'public',
    daysAgo: 42,
    recalls: 7
  },
  {
    title: 'Undo the last commit but keep the changes',
    content: '$ git reset --soft HEAD~1\n\n# Changes return to the staging area, commit disappears.',
    visibility: 'public',
    daysAgo: 40,
    recalls: 6
  },
  {
    title: 'Debounce hook in React',
    content:
      '```javascript\nfunction useDebounce(value, delay = 300) {\n  const [debounced, setDebounced] = useState(value);\n\n  useEffect(() => {\n    const timer = setTimeout(() => setDebounced(value), delay);\n    return () => clearTimeout(timer);\n  }, [value, delay]);\n\n  return debounced;\n}\n```',
    visibility: 'public',
    daysAgo: 35,
    recalls: 5
  },
  {
    title: 'MongoDB aggregation: join two collections',
    content:
      '```javascript\ndb.collection.aggregate([\n  { $lookup: {\n      from: "users",\n      localField: "createdBy",\n      foreignField: "_id",\n      as: "author"\n  }},\n  { $unwind: "$author" },\n  { $group: { _id: "$author._id", total: { $sum: 1 } } }\n]);\n```',
    visibility: 'private',
    daysAgo: 30,
    recalls: 4
  },
  {
    title: 'Find what is listening on a port',
    content: '$ lsof -i :5000\n$ sudo kill -9 <PID>\n\n# Windows:\n> netstat -ano | findstr :5000',
    visibility: 'private',
    daysAgo: 28,
    recalls: 5
  },
  {
    title: 'Docker: remove every stopped container and dangling image',
    content: '$ docker container prune -f\n$ docker image prune -a -f\n$ docker system df   # check what you reclaimed',
    visibility: 'public',
    daysAgo: 26,
    recalls: 3
  },
  {
    title: 'JavaScript closures, in one sentence',
    content:
      'A closure is a function that keeps a reference to the scope it was created in, so it can still read those variables after that scope has returned.\n\n```javascript\nfunction counter() {\n  let count = 0;\n  return () => ++count;\n}\n```',
    visibility: 'public',
    daysAgo: 24,
    recalls: 6
  },
  {
    title: 'Promise.all vs Promise.allSettled',
    content:
      '```javascript\n// Rejects as soon as ANY promise rejects\nawait Promise.all([a, b, c]);\n\n// Always resolves; inspect status per entry\nconst results = await Promise.allSettled([a, b, c]);\nresults.filter(r => r.status === "rejected");\n```',
    visibility: 'private',
    daysAgo: 22,
    recalls: 2
  },
  {
    title: 'Python list comprehension with a condition',
    content:
      '```python\nsquares = [n * n for n in range(20) if n % 2 == 0]\n\n# Dict comprehension\nlookup = {user.id: user for user in users if user.active}\n```',
    visibility: 'public',
    daysAgo: 20,
    recalls: 3
  },
  {
    title: 'MongoDB native driver: transactions',
    content:
      '```javascript\nconst session = client.startSession();\n\nawait session.withTransaction(async () => {\n  await drops.deleteOne({ _id: id }, { session });\n  await history.deleteMany({ dropId: id }, { session });\n});\n\nawait session.endSession();\n```',
    visibility: 'private',
    daysAgo: 18,
    recalls: 2
  },
  {
    title: 'Tailwind: dark mode via class strategy',
    content:
      '```javascript\n// tailwind.config.js\nmodule.exports = {\n  darkMode: "class",\n  content: ["./src/**/*.{js,jsx}"]\n};\n```\n\nToggle by adding `dark` to `<html>`.',
    visibility: 'public',
    daysAgo: 16,
    recalls: 4
  },
  {
    title: 'The MDN reference for CSS grid',
    content: 'Best grid reference on the internet: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout',
    visibility: 'public',
    daysAgo: 15,
    recalls: 1
  },
  {
    title: 'Spaced repetition: why Fibonacci works',
    content:
      'Review intervals should grow, because each successful recall strengthens the memory and pushes the forgetting curve out.\n\nFibonacci grows faster than linear but slower than doubling, so early reviews stay close together while later ones spread out — which is exactly the shape of forgetting.',
    visibility: 'public',
    daysAgo: 14,
    recalls: 5
  },
  {
    title: 'Node: read env vars safely',
    content:
      '```javascript\nfunction required(name) {\n  const value = process.env[name];\n  if (!value) throw new Error(`Missing env var: ${name}`);\n  return value;\n}\n```',
    visibility: 'private',
    daysAgo: 12,
    recalls: 3
  },
  {
    title: 'npm: find and fix vulnerable dependencies',
    content: '$ npm audit\n$ npm audit fix\n$ npm outdated\n$ npm update --save',
    visibility: 'private',
    daysAgo: 11,
    recalls: 2
  },
  {
    title: 'CSS: centre anything, two ways',
    content:
      '```css\n/* Flex */\n.parent { display: flex; align-items: center; justify-content: center; }\n\n/* Grid */\n.parent { display: grid; place-items: center; }\n```',
    visibility: 'public',
    daysAgo: 10,
    recalls: 4
  },
  {
    title: 'Postgres: kill a long-running query',
    content:
      '```sql\nSELECT pid, query, state, age(clock_timestamp(), query_start) AS runtime\nFROM pg_stat_activity\nWHERE state != \'idle\'\nORDER BY runtime DESC;\n\nSELECT pg_terminate_backend(12345);\n```',
    visibility: 'private',
    daysAgo: 9,
    recalls: 1
  },
  {
    title: 'RTK Query: invalidate a tag after a mutation',
    content:
      '```javascript\ncreateDrop: builder.mutation({\n  query: (body) => ({ url: "/drops", method: "POST", body }),\n  invalidatesTags: ["Drop", "Stats", "RecallQueue"]\n})\n```',
    visibility: 'private',
    daysAgo: 8,
    recalls: 2
  },
  {
    title: 'JWT: what actually belongs in the payload',
    content:
      'Put the user id, a jti and the expiry. Nothing secret — the payload is base64, not encrypted, and anyone holding the token can read it.\n\nNever put a password hash, an email you would not show publicly, or a permissions blob you cannot revoke.',
    visibility: 'public',
    daysAgo: 7,
    recalls: 3
  },
  {
    title: 'Bash: retry a command until it succeeds',
    content: '$ until curl -sf http://localhost:5000/api/health; do\n>   echo "waiting..."; sleep 2;\n> done',
    visibility: 'private',
    daysAgo: 6,
    recalls: 1
  },
  {
    title: 'React: why the dependency array matters',
    content:
      'An empty array runs the effect once. No array runs it after every render. A populated array runs it whenever one of those values changes by `Object.is`.\n\nMost infinite loops are an object or array literal in the deps — recreated every render, so never equal.',
    visibility: 'public',
    daysAgo: 5,
    recalls: 2
  },
  {
    title: 'Nginx as a reverse proxy for an API',
    content:
      '```nginx\nlocation /api/ {\n  proxy_pass http://backend:5000;\n  proxy_set_header Host $host;\n  proxy_set_header X-Real-IP $remote_addr;\n  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n}\n```',
    visibility: 'private',
    daysAgo: 4,
    recalls: 1
  },
  {
    title: 'Excellent read on database indexing',
    content: 'Use The Index, Luke — the clearest explanation of B-tree indexes anywhere: https://use-the-index-luke.com',
    visibility: 'public',
    daysAgo: 3,
    recalls: 0
  },
  {
    title: 'Regex: match an ISO date',
    content: '```javascript\nconst ISO_DATE = /^\\d{4}-\\d{2}-\\d{2}$/;\nISO_DATE.test("2026-07-21"); // true\n```',
    visibility: 'private',
    daysAgo: 2,
    recalls: 0
  }
];

const COLLECTION_LIBRARY = [
  {
    name: 'Git Survival Kit',
    description: 'The handful of git commands that actually come up under pressure.',
    color: '#f97316',
    match: /git|commit|reset/i,
    shared: true
  },
  {
    name: 'React Patterns',
    description: 'Hooks, effects and state patterns worth remembering.',
    color: '#38bdf8',
    match: /react|hook|rtk|useeffect|dependency/i,
    shared: false
  },
  {
    name: 'Database Notes',
    description: 'MongoDB and Postgres snippets, aggregations and index thinking.',
    color: '#34d399',
    match: /mongo|postgres|aggregation|index|transaction|sql/i,
    shared: true
  },
  {
    name: 'Shell & DevOps',
    description: 'Docker, nginx and the terminal commands I always forget.',
    color: '#a78bfa',
    match: /docker|nginx|bash|port|npm|lsof/i,
    shared: false
  }
];

/** Deterministic-ish jitter so recall timestamps do not all land on the hour. */
function jitter(maxMinutes) {
  return Math.floor(Math.random() * maxMinutes) * 60 * 1000;
}

/**
 * Builds a drop document plus its recall history.
 *
 * Recalls are walked *forward* through the Fibonacci ladder from the creation
 * date, so `nextRecallDate` is genuinely the product of the algorithm rather
 * than a hard-coded value — which is what makes the seeded dashboard an honest
 * demonstration of it.
 */
function buildDrop(template, ownerId, recallInterval) {
  const createdAt = new Date(Date.now() - template.daysAgo * DAY - jitter(600));
  const enriched = tagService.enrich({
    title: template.title,
    content: template.content
  });

  const drop = {
    title: template.title,
    content: template.content,
    type: enriched.type,
    language: enriched.language,
    tags: enriched.tags,
    visibility: template.visibility,
    createdBy: ownerId,
    isFavorite: false,
    recallCount: 0,
    scheduleStep: 0,
    lastRecalled: null,
    nextRecallDate: recallService.initialRecallDate(createdAt, recallInterval),
    relatedDrops: [],
    createdAt: createdAt,
    updatedAt: createdAt
  };

  const history = [];
  let cursor = new Date(createdAt.getTime() + HOUR);

  for (let step = 1; step <= template.recalls; step += 1) {
    // Confidence trends upward as a drop is reviewed more — a plausible
    // learning curve, and it exercises the confidence branches in applyRecall.
    const confidence = Math.min(5, 2 + Math.floor(step / 2));

    const outcome = recallService.applyRecall({
      recallCount: drop.recallCount,
      confidence: confidence,
      recallInterval: recallInterval,
      now: cursor
    });

    drop.recallCount = outcome.recallCount;
    drop.scheduleStep = outcome.scheduleStep;
    drop.lastRecalled = outcome.lastRecalled;
    drop.nextRecallDate = outcome.nextRecallDate;
    drop.updatedAt = outcome.lastRecalled;

    history.push({
      recalledAt: new Date(cursor.getTime()),
      recallType: step % 4 === 0 ? 'scheduled' : 'manual',
      confidence: confidence
    });

    cursor = new Date(outcome.nextRecallDate.getTime() + jitter(180));

    // Stop if the ladder has walked past today — a drop cannot have been
    // recalled in the future.
    if (cursor.getTime() > Date.now()) {
      break;
    }
  }

  // A few favourites so the favourites tab is not empty.
  drop.isFavorite = template.recalls >= 5;

  return { drop: drop, history: history };
}

/**
 * Guarantees the demo account has an unbroken recent streak.
 *
 * Without this the streak depends on where the Fibonacci ladder happened to
 * land, which usually leaves gaps. Back-filling one recall per day for the last
 * seven days makes the dashboard's streak card meaningful on first load.
 */
function buildStreakHistory(dropIds, userId) {
  const entries = [];

  for (let daysBack = 6; daysBack >= 0; daysBack -= 1) {
    const day = new Date(Date.now() - daysBack * DAY);
    day.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);

    entries.push({
      dropId: dropIds[daysBack % dropIds.length],
      userId: userId,
      recalledAt: day,
      recallType: 'manual',
      confidence: 3 + Math.floor(Math.random() * 3)
    });
  }

  return entries;
}

/**
 * Links drops that share tags, so the related-drops feature has real data.
 * Bidirectional, matching the behaviour of POST /api/drops/:id/relate.
 */
function buildRelationships(insertedDrops) {
  const updates = [];

  insertedDrops.forEach(function (drop) {
    const related = insertedDrops
      .filter(function (candidate) {
        if (String(candidate._id) === String(drop._id)) {
          return false;
        }
        const shared = (candidate.tags || []).filter(function (tag) {
          return (drop.tags || []).indexOf(tag) !== -1;
        });
        return shared.length >= 2;
      })
      .slice(0, 3)
      .map(function (candidate) {
        return candidate._id;
      });

    if (related.length) {
      updates.push({
        updateOne: {
          filter: { _id: drop._id },
          update: { $addToSet: { relatedDrops: { $each: related } } }
        }
      });
    }
  });

  return updates;
}

function wipe(db) {
  logger.warn('--fresh supplied: clearing all collections');

  return Promise.all([
    db.collection(COLLECTIONS.USERS).deleteMany({}),
    db.collection(COLLECTIONS.DROPS).deleteMany({}),
    db.collection(COLLECTIONS.COLLECTIONS).deleteMany({}),
    db.collection(COLLECTIONS.RECALL_HISTORY).deleteMany({})
  ]);
}

function seedUser(db, userSpec, isPrimary) {
  logger.info('Seeding user', { username: userSpec.username });

  return userModel
    .createUser({
      username: userSpec.username,
      email: userSpec.email,
      password: userSpec.password
    })
    .catch(function (error) {
      // Re-running the seed without --fresh should top up, not explode.
      if (error.statusCode === 409) {
        logger.warn('User already exists, reusing', { username: userSpec.username });
        return userModel.findByEmailWithPassword(userSpec.email).then(userModel.toPublicUser);
      }
      throw error;
    })
    .then(function (user) {
      const ownerId = require('../utils/ids').toObjectId(user.id, 'userId');
      const recallInterval = user.preferences.recallInterval;

      // The secondary account gets a smaller slice, which is enough to prove
      // that one user never sees another's drops.
      const templates = isPrimary ? DROP_LIBRARY : DROP_LIBRARY.slice(0, 6);

      const built = templates.map(function (template) {
        return buildDrop(template, ownerId, recallInterval);
      });

      return db
        .collection(COLLECTIONS.DROPS)
        .insertMany(
          built.map(function (item) {
            return item.drop;
          })
        )
        .then(function (result) {
          const insertedDrops = built.map(function (item, index) {
            item.drop._id = result.insertedIds[index];
            return item.drop;
          });

          // Recall history rows matching what the ladder produced.
          const historyRows = [];

          built.forEach(function (item, index) {
            item.history.forEach(function (entry) {
              historyRows.push({
                dropId: result.insertedIds[index],
                userId: ownerId,
                recalledAt: entry.recalledAt,
                recallType: entry.recallType,
                confidence: entry.confidence
              });
            });
          });

          if (isPrimary) {
            historyRows.push.apply(
              historyRows,
              buildStreakHistory(Object.values(result.insertedIds), ownerId)
            );
          }

          const relationshipUpdates = buildRelationships(insertedDrops);

          const collectionDocs = COLLECTION_LIBRARY.map(function (spec) {
            const memberIds = insertedDrops
              .filter(function (drop) {
                return spec.match.test(drop.title + ' ' + drop.content + ' ' + drop.tags.join(' '));
              })
              .map(function (drop) {
                return drop._id;
              });

            return {
              name: spec.name,
              description: spec.description,
              createdBy: ownerId,
              drops: memberIds,
              color: spec.color,
              isShared: spec.shared,
              shareToken: spec.shared
                ? require('crypto').randomBytes(16).toString('hex')
                : null,
              createdAt: new Date(Date.now() - 20 * DAY),
              updatedAt: new Date()
            };
          }).filter(function (doc) {
            // Skip collections that matched nothing — an empty demo collection
            // teaches the reviewer nothing.
            return doc.drops.length > 0;
          });

          return Promise.all([
            historyRows.length
              ? db.collection(COLLECTIONS.RECALL_HISTORY).insertMany(historyRows)
              : Promise.resolve({ insertedCount: 0 }),
            relationshipUpdates.length
              ? db.collection(COLLECTIONS.DROPS).bulkWrite(relationshipUpdates)
              : Promise.resolve({ modifiedCount: 0 }),
            isPrimary && collectionDocs.length
              ? db.collection(COLLECTIONS.COLLECTIONS).insertMany(collectionDocs)
              : Promise.resolve({ insertedCount: 0 })
          ]).then(function (results) {
            // Collections are only inserted for the primary account, so the
            // secondary account must not report tokens that were never written.
            const shared = isPrimary
              ? collectionDocs.filter(function (doc) {
                  return doc.isShared;
                })
              : [];

            return {
              username: user.username,
              email: userSpec.email,
              password: userSpec.password,
              drops: insertedDrops.length,
              recallEvents: results[0].insertedCount || historyRows.length,
              relationships: relationshipUpdates.length,
              collections: results[2].insertedCount || 0,
              shareTokens: shared.map(function (doc) {
                return { name: doc.name, token: doc.shareToken };
              })
            };
          });
        });
    });
}

function run() {
  const fresh = process.argv.indexOf('--fresh') !== -1;

  return connection
    .connect()
    .then(function () {
      return syncSchema();
    })
    .then(function () {
      const db = connection.getDb();
      return fresh ? wipe(db).then(function () { return db; }) : db;
    })
    .then(function (db) {
      // Sequential, so the log reads in order and the shared Mongo tier is not
      // hit with two bulk inserts at once.
      return SEED_USERS.reduce(function (chain, userSpec, index) {
        return chain.then(function (summaries) {
          return seedUser(db, userSpec, index === 0).then(function (summary) {
            summaries.push(summary);
            return summaries;
          });
        });
      }, Promise.resolve([]));
    })
    .then(function (summaries) {
      logger.info('Seed complete');

      const lines = ['', '  DevDrops seed data ready', ''];

      summaries.forEach(function (summary) {
        lines.push('  ' + summary.username);
        lines.push('    email       ' + summary.email);
        lines.push('    password    ' + summary.password);
        lines.push('    drops       ' + summary.drops);
        lines.push('    recalls     ' + summary.recallEvents);
        lines.push('    links       ' + summary.relationships);
        lines.push('    collections ' + summary.collections);

        summary.shareTokens.forEach(function (entry) {
          lines.push('    share       /share/' + entry.token + '  (' + entry.name + ')');
        });

        lines.push('');
      });

      process.stdout.write(lines.join('\n') + '\n');
    });
}

if (require.main === module) {
  run()
    .then(function () {
      return connection.close();
    })
    .then(function () {
      process.exit(0);
    })
    .catch(function (error) {
      logger.error('Seed failed', error);
      connection.close().finally(function () {
        process.exit(1);
      });
    });
}

module.exports = { run: run, DROP_LIBRARY: DROP_LIBRARY };
