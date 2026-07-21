'use strict';

/**
 * Route aggregation and the health endpoint.
 */

const express = require('express');
const connection = require('../db/connection');

const authRoutes = require('./authRoutes');
const dropRoutes = require('./dropRoutes');
const collectionRoutes = require('./collectionRoutes');
const publicRoutes = require('./publicRoutes');

const router = express.Router();

/**
 * GET /api/health
 *
 * Used by Render/Railway and quoted in the README as the backend health URL.
 * It pings the database rather than just returning 200, so a server that is up
 * but cannot reach Atlas reports unhealthy instead of silently failing every
 * request behind it.
 */
router.get('/health', function healthCheck(req, res) {
  const startedAt = Date.now();

  connection
    .getDb()
    .command({ ping: 1 })
    .then(function () {
      res.status(200).json({
        success: true,
        status: 'healthy',
        uptimeSeconds: Math.floor(process.uptime()),
        database: {
          connected: true,
          latencyMs: Date.now() - startedAt,
          transactions: connection.supportsTransactions()
        },
        timestamp: new Date().toISOString()
      });
    })
    .catch(function (error) {
      // 503, not 500: the service is temporarily unable to serve, which is what
      // a load balancer needs to know.
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        database: { connected: false, error: error.message },
        timestamp: new Date().toISOString()
      });
    });
});

router.use('/auth', authRoutes);
router.use('/drops', dropRoutes);
router.use('/collections', collectionRoutes);
router.use('/public', publicRoutes);

module.exports = router;
