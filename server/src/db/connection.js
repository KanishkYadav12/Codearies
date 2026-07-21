'use strict';

/**
 * MongoDB connection management using the *native* driver.
 *
 * Backend constraint #1: no ORM/ODM. Everything below talks to `mongodb`
 * directly. The module owns a single MongoClient for the process lifetime and
 * hands out lazily-memoised collection handles.
 */

const { MongoClient } = require('mongodb');
const env = require('../config/env');
const logger = require('../utils/logger').child('db');

const COLLECTIONS = {
  USERS: 'users',
  DROPS: 'drops',
  COLLECTIONS: 'collections',
  RECALL_HISTORY: 'recallHistory'
};

// Name of the aggregation-backed view created in db/indexes.js.
const DROP_STATS_VIEW = 'dropStatsView';

let client = null;
let database = null;
let connecting = null;

// Whether the deployment can run multi-document transactions. Standalone mongod
// cannot; Atlas and replica sets can. Detected once at connect time so callers
// can degrade gracefully instead of crashing on every write path.
let transactionsSupported = false;

/**
 * Opens the connection. Repeated calls return the same in-flight promise so
 * concurrent callers (server boot + a script, say) never open two pools.
 */
function connect() {
  if (database) {
    return Promise.resolve(database);
  }

  if (connecting) {
    return connecting;
  }

  logger.info('Connecting to MongoDB', { db: env.MONGODB_DB_NAME });

  client = new MongoClient(env.MONGODB_URI, {
    // Keep the pool modest: free Render/Railway dynos and Atlas shared tiers
    // both cap connections aggressively.
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    retryWrites: true
  });

  connecting = client
    .connect()
    .then(function () {
      database = client.db(env.MONGODB_DB_NAME);
      return detectTransactionSupport();
    })
    .then(function () {
      logger.info('MongoDB connected', {
        db: env.MONGODB_DB_NAME,
        transactions: transactionsSupported
      });
      return database;
    })
    .catch(function (error) {
      // Reset so a later retry can start cleanly rather than resolving a
      // permanently-rejected promise.
      connecting = null;
      client = null;
      database = null;
      logger.error('MongoDB connection failed', error);
      throw error;
    });

  return connecting;
}

/**
 * Transactions need a replica set or a sharded cluster. `hello.setName` is
 * present on replica set members and absent on standalone servers.
 */
function detectTransactionSupport() {
  return database
    .admin()
    .command({ hello: 1 })
    .then(function (info) {
      transactionsSupported = Boolean(info.setName || info.msg === 'isdbgrid');
      if (!transactionsSupported) {
        logger.warn(
          'Standalone MongoDB detected - transactional operations will run ' +
            'sequentially without atomicity guarantees'
        );
      }
    })
    .catch(function (error) {
      // Shared Atlas tiers can refuse admin commands; assume no transactions
      // rather than failing the boot.
      transactionsSupported = false;
      logger.warn('Could not determine transaction support, assuming unsupported', {
        reason: error.message
      });
    });
}

function getDb() {
  if (!database) {
    throw new Error('Database not connected. Call connect() during startup first.');
  }
  return database;
}

function getClient() {
  if (!client) {
    throw new Error('Mongo client unavailable. Call connect() during startup first.');
  }
  return client;
}

function getCollection(name) {
  return getDb().collection(name);
}

function supportsTransactions() {
  return transactionsSupported;
}

/**
 * Runs `work` inside a transaction when the deployment supports one, and
 * falls back to running it with a plain (session-less) execution otherwise.
 *
 * `work` receives the session — or `null` in fallback mode — and must forward
 * it to every operation it performs. Database constraint #3 relies on this for
 * drop deletion (drop + recall history + collection membership) and for bulk
 * operations.
 */
function withTransaction(work) {
  if (!transactionsSupported) {
    return Promise.resolve().then(function () {
      return work(null);
    });
  }

  const session = getClient().startSession();
  let result;

  return session
    .withTransaction(function () {
      return Promise.resolve()
        .then(function () {
          return work(session);
        })
        .then(function (value) {
          result = value;
          return value;
        });
    })
    .then(function () {
      return result;
    })
    .finally(function () {
      return session.endSession();
    });
}

function close() {
  if (!client) {
    return Promise.resolve();
  }

  const closing = client.close();
  client = null;
  database = null;
  connecting = null;

  return closing.then(function () {
    logger.info('MongoDB connection closed');
  });
}

module.exports = {
  connect: connect,
  close: close,
  getDb: getDb,
  getClient: getClient,
  getCollection: getCollection,
  withTransaction: withTransaction,
  supportsTransactions: supportsTransactions,
  COLLECTIONS: COLLECTIONS,
  DROP_STATS_VIEW: DROP_STATS_VIEW
};
