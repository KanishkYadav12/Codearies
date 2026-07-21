'use strict';

/**
 * Process entry point.
 *
 * Responsibilities, in order:
 *   1. validate the environment (happens at require time in config/env)
 *   2. connect to MongoDB and ensure indexes/views exist
 *   3. only then start listening
 *   4. shut down cleanly on SIGTERM/SIGINT
 *
 * Connecting before listening matters: a server that accepts traffic while the
 * database is still unreachable answers its first requests with 500s.
 */

const env = require('./config/env');
const createApp = require('./app');
const connection = require('./db/connection');
const { syncSchema } = require('./db/indexes');
const logger = require('./utils/logger').child('server');

let server = null;
let shuttingDown = false;

function start() {
  logger.info('Starting DevDrops API', {
    env: env.NODE_ENV,
    node: process.version
  });

  connection
    .connect()
    .then(function () {
      // Idempotent, and cheap when everything already exists. Running it on
      // boot means a fresh Atlas cluster is correctly indexed without a manual
      // deploy step.
      return syncSchema();
    })
    .then(function () {
      const app = createApp();

      server = app.listen(env.PORT, function () {
        logger.info('API listening', {
          port: env.PORT,
          health: 'http://localhost:' + env.PORT + '/api/health'
        });
      });

      // Slightly above typical load-balancer idle timeouts, which avoids the
      // race where the proxy reuses a connection the server is closing.
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 70000;

      server.on('error', function (error) {
        if (error.code === 'EADDRINUSE') {
          logger.error('Port already in use', { port: env.PORT });
        } else {
          logger.error('HTTP server error', error);
        }
        process.exit(1);
      });
    })
    .catch(function (error) {
      logger.error('Startup failed', error);
      process.exit(1);
    });
}

/**
 * Stops accepting new connections, drains in-flight requests, then closes the
 * database pool. The timer is a hard backstop so a stuck request cannot block
 * the deploy indefinitely.
 */
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info('Shutting down', { signal: signal });

  const forceExit = setTimeout(function () {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  // Do not let the backstop timer itself keep the process alive.
  if (forceExit.unref) {
    forceExit.unref();
  }

  const closeServer = server
    ? new Promise(function (resolve) {
        server.close(resolve);
      })
    : Promise.resolve();

  closeServer
    .then(function () {
      return connection.close();
    })
    .then(function () {
      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    })
    .catch(function (error) {
      logger.error('Error during shutdown', error);
      process.exit(1);
    });
}

['SIGTERM', 'SIGINT'].forEach(function (signal) {
  process.on(signal, function () {
    shutdown(signal);
  });
});

/**
 * A promise rejection nobody handled means state is now unknown. Log it and
 * exit rather than continuing in a corrupted state — the platform restarts us.
 */
process.on('unhandledRejection', function (reason) {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason : { value: String(reason) }
  });
  shutdown('unhandledRejection');
});

process.on('uncaughtException', function (error) {
  logger.error('Uncaught exception', error);
  shutdown('uncaughtException');
});

start();
