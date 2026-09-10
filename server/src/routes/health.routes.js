import express from 'express';
import config from '../config/env.js';

const router = express.Router();

router.get('/', (req, res) => {
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    status: 'ok',
    service: 'CrisisAI API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSeconds)}s`,
    environment: config.nodeEnv,
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
