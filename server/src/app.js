'use strict';

/**
 * Express application assembly.
 *
 * Kept separate from server.js so the app can be constructed without binding a
 * port — which is what makes it testable and what lets server.js own the
 * connect-then-listen ordering.
 *
 * Middleware order is deliberate and load-bearing; see the comments below.
 */

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const routes = require('./routes');
const { requestLogger } = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiter');
const logger = require('./utils/logger').child('app');

function createApp() {
  const app = express();

  // Render/Railway/nginx terminate TLS and forward the request, so the socket
  // address is the proxy's. Trusting one hop lets req.ip and the rate limiter
  // see the real client address — required for the per-IP auth limit to work.
  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  // Do not advertise the framework.
  app.disable('x-powered-by');

  /* ---------------------------------------------------------------- */
  /* Security headers                                                  */
  /*                                                                   */
  /* Written by hand rather than pulling in helmet: this is a JSON API, */
  /* so only a handful of headers are actually meaningful here.         */
  /* ---------------------------------------------------------------- */
  app.use(function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // The API never serves HTML, so nothing legitimate should ever be rendered
    // from one of its responses.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

    if (env.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  });

  /* ---------------------------------------------------------------- */
  /* CORS                                                              */
  /* ---------------------------------------------------------------- */
  app.use(
    cors({
      origin: function (origin, callback) {
        // Same-origin requests, curl and server-to-server calls send no Origin.
        if (!origin) {
          callback(null, true);
          return;
        }

        if (env.CLIENT_ORIGIN.indexOf(origin) !== -1) {
          callback(null, true);
          return;
        }

        // Vercel preview deployments get a generated subdomain per branch, so
        // an exact-match allowlist would break every preview build.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
          callback(null, true);
          return;
        }

        logger.warn('Blocked CORS origin', { origin: origin });
        callback(new Error('CORS_NOT_ALLOWED'));
      },
      // Required for the httpOnly session cookie to be sent cross-site.
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After']
    })
  );

  /* ---------------------------------------------------------------- */
  /* Body parsing                                                      */
  /*                                                                   */
  /* Before the logger, so it can log a redacted body; the 256kb cap    */
  /* comfortably exceeds the 20k content limit while bounding memory.   */
  /* ---------------------------------------------------------------- */
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb' }));
  app.use(cookieParser());

  // Logging runs before the limiter so rejected requests still appear in logs.
  app.use(requestLogger);

  // Backstop limit. The tighter per-area limits are applied inside the routers.
  app.use(globalLimiter);

  /* ---------------------------------------------------------------- */
  /* Routes                                                            */
  /* ---------------------------------------------------------------- */
  app.use('/api', routes);

  // Root: a friendly pointer rather than a 404, since people paste the bare
  // backend URL into a browser to check it is alive.
  app.get('/', function root(req, res) {
    res.status(200).json({
      name: 'DevDrops API',
      version: '1.0.0',
      docs: 'https://github.com/  (see README.md)',
      health: '/api/health'
    });
  });

  /* ---------------------------------------------------------------- */
  /* Error handling — always last                                      */
  /* ---------------------------------------------------------------- */
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
