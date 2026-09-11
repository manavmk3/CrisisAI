import express from 'express';
import mongoose from 'mongoose';
import config from '../config/env.js';

const router = express.Router();

const DB_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

router.get('/', (req, res) => {
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();
  const dbStateCode = mongoose.connection.readyState;
  const isDbConnected = dbStateCode === 1;

  res.status(200).json({
    status: isDbConnected ? 'ok' : 'degraded',
    service: 'CrisisAI API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSeconds)}s`,
    environment: config.nodeEnv,
    database: {
      status: DB_STATES[dbStateCode] || 'unknown',
      connected: isDbConnected,
    },
    diagnostics: {
      nodeVersion: process.version,
      memory: {
        heapUsedMB: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2),
        rssMB: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      },
    },
  });
});

export default router;

