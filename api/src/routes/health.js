'use strict';

const { Router } = require('express');
const { genAI } = require('../config/gcpClients');
const env = require('../config/env');

const router = Router();

/**
 * GET /health
 * Basic liveness check — confirms the server is up and env vars loaded.
 * @returns {{ status: string, timestamp: string }}
 */
router.get('/', (_req, res) => {
  const missingEnv = env.getMissingEnv();

  if (missingEnv.length > 0) {
    return res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      missing: missingEnv,
    });
  }

  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /health/gemini
 * Smoke test — sends a minimal prompt to Gemini and returns the response.
 * Confirms GCP auth and Vertex AI connectivity without touching real data.
 * @returns {{ status: string, response: string }}
 */
router.get('/gemini', async (_req, res, next) => {
  try {
    const missingEnv = env.getMissingEnv();

    if (!genAI || missingEnv.length > 0) {
      return res.status(503).json({
        status: 'not_ready',
        missing: missingEnv,
        message: 'Gemini is unavailable because required environment variables are missing.',
      });
    }

    const response = await genAI.models.generateContent({
      model: env.geminiModel,
      contents: 'Reply with exactly: GreenTrace online',
    });

    const text = response?.text
      ?? response?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')
      ?? '';

    return res.json({ status: 'ok', response: text.trim() });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;