'use strict';

const request = require('supertest');

// Mock GCP clients before app loads so no real credentials are needed in CI
jest.mock('../src/config/gcpClients', () => ({
  geminiModel: {
    generateContent: jest.fn().mockResolvedValue({
      response: {
        candidates: [{
          content: { parts: [{ text: 'GreenTrace online' }] },
        }],
      },
    }),
  },
  bigquery:      {},
  storage:       {},
  secretManager: {},
  documentAI:    {},
}));

const app = require('../src/index');

beforeEach(() => {
  const { geminiModel } = require('../src/config/gcpClients');
  geminiModel.generateContent = jest.fn().mockResolvedValue({
    response: {
      candidates: [{
        content: { parts: [{ text: 'GreenTrace online' }] },
      }],
    },
  });
  geminiModel.models = undefined;
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /health/gemini', () => {
  it('returns 200 and Gemini response when client succeeds', async () => {
    const res = await request(app).get('/health/gemini');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.response).toBe('GreenTrace online');
  });

  it('returns 503 when required env vars are missing for Gemini health checks', async () => {
    const previous = { ...process.env };
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_REGION;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.STORAGE_BUCKET;
    delete process.env.BQ_DATASET;
    delete process.env.GEMINI_MODEL;

    const res = await request(app).get('/health/gemini');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');

    Object.assign(process.env, previous);
  });

  it('returns the direct text payload when Gemini responds with a flattened text field', async () => {
    const { geminiModel } = require('../src/config/gcpClients');
    geminiModel.generateContent.mockResolvedValueOnce({ text: 'GreenTrace online' });

    const res = await request(app).get('/health/gemini');

    expect(res.status).toBe(200);
    expect(res.body.response).toBe('GreenTrace online');
  });

  it('returns 503 when Gemini client does not expose a supported API shape', async () => {
    const { geminiModel } = require('../src/config/gcpClients');
    geminiModel.generateContent = undefined;
    geminiModel.models = {};

    const res = await request(app).get('/health/gemini');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  it('returns 500 when Gemini client throws', async () => {
    const { geminiModel } = require('../src/config/gcpClients');
    geminiModel.generateContent.mockRejectedValueOnce(new Error('Vertex AI unavailable'));
    const res = await request(app).get('/health/gemini');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});