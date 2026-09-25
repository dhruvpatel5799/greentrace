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

  it('returns 500 when Gemini client throws', async () => {
    const { geminiModel } = require('../src/config/gcpClients');
    geminiModel.generateContent.mockRejectedValueOnce(new Error('Vertex AI unavailable'));
    const res = await request(app).get('/health/gemini');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});