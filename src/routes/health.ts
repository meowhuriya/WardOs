import express from 'express';
import { config } from '../config.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    product: 'WardOS',
    version: '1.0.0',
    mcp_spec_version: '2025-11-25',
    timestamp: new Date().toISOString(),
    bedrock: {
      enabled: config.bedrock.enabled,
      region: config.bedrock.region,
      model: config.bedrock.modelId,
    },
    uptime_seconds: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
