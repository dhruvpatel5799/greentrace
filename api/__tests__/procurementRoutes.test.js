'use strict';

const request = require('supertest');
const { Pool } = require('pg');
const env = require('../src/config/env');

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

jest.mock('../src/config/gcpClients', () => ({
  documentAI: {
    processDocument: jest.fn(),
  },
  bigquery: {},
  storage: {},
  secretManager: {},
  geminiModel: { generateContent: jest.fn() },
}));

const app = require('../src/index');
const { readProcurementCsv } = require('../src/modules/carbon-auditor/procurementCsvValidator');
const { parseProcurementDocument } = require('../src/services/documentAiService');
const cloudSqlService = require('../src/services/cloudSqlProcurementService');

const originalEnv = {
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  GCP_REGION: process.env.GCP_REGION,
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  BQ_DATASET: process.env.BQ_DATASET,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  DOCUMENT_PROCESSOR_ID: process.env.DOCUMENT_PROCESSOR_ID,
  CLOUDSQL_HOST: process.env.CLOUDSQL_HOST,
  CLOUDSQL_DB_NAME: process.env.CLOUDSQL_DB_NAME,
  CLOUDSQL_DB_USER: process.env.CLOUDSQL_DB_USER,
  CLOUDSQL_DB_PASSWORD: process.env.CLOUDSQL_DB_PASSWORD,
};

beforeEach(() => {
  jest.clearAllMocks();
  cloudSqlService.resetPool();
  const gcpClients = require('../src/config/gcpClients');
  gcpClients.geminiModel = {
    generateContent: jest.fn().mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: 'GreenTrace online' }] } }],
      },
    }),
  };
  process.env.GCP_PROJECT_ID = 'demo-project';
  process.env.GCP_REGION = 'us-central1';
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'service-account.json';
  process.env.STORAGE_BUCKET = 'demo-bucket';
  process.env.BQ_DATASET = 'greentrace_data';
  process.env.GEMINI_MODEL = 'gemini-1.5-pro';
  process.env.DOCUMENT_PROCESSOR_ID = 'demo-processor';
  process.env.CLOUDSQL_HOST = 'localhost';
  process.env.CLOUDSQL_DB_NAME = 'greentrace';
  process.env.CLOUDSQL_DB_USER = 'greentrace_user';
  process.env.CLOUDSQL_DB_PASSWORD = 'secret';
  Pool.mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({ rowCount: 2 }),
  }));
});

afterEach(() => {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  jest.restoreAllMocks();
});

describe('procurement CSV validation', () => {
  it('accepts a valid CSV payload with the expected columns', () => {
    const csv = [
      'vendor_name,description,amount_usd,naics_code',
      'Acme Supply,Office chairs,1500.00,423110',
      'Northwind,Packaging tape,320.45,424690',
    ].join('\n');

    const parsed = readProcurementCsv(csv);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.headers).toEqual([
      'vendor_name',
      'description',
      'amount_usd',
      'naics_code',
    ]);
    expect(parsed.errors).toEqual([]);
  });

  it('rejects a CSV missing required columns', () => {
    const csv = [
      'vendor_name,description,total_cost',
      'Acme Supply,Office chairs,1500.00',
    ].join('\n');

    const parsed = readProcurementCsv(csv);

    expect(parsed.errors).toContain('CSV is missing required headers: amount_usd');
  });

  it('rejects empty CSV input', () => {
    const parsed = readProcurementCsv('');
    expect(parsed.errors).toContain('CSV file is empty.');
  });

  it('ignores blank rows while preserving valid rows in the payload', () => {
    const csv = [
      'vendor_name,description,amount_usd,naics_code',
      'Acme Supply,Office chairs,1500.00,423110',
      '',
      ' , , , ',
    ].join('\n');

    const parsed = readProcurementCsv(csv);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].vendor_name).toBe('Acme Supply');
  });

  it('handles quoted values and invalid numeric cells', () => {
    const csv = [
      'vendor_name,description,amount_usd,naics_code',
      '"Acme, Inc.","Office chairs and desks","$1,250.50",423110',
      'NoVendor,"General supply",bad-number,',
    ].join('\n');

    const parsed = readProcurementCsv(csv);

    expect(parsed.headers).toEqual([
      'vendor_name',
      'description',
      'amount_usd',
      'naics_code',
    ]);
    expect(parsed.rows[0].vendor_name).toBe('Acme, Inc.');
    expect(parsed.rows[0].amount_usd).toBe(1250.5);
    expect(parsed.rows[1].amount_usd).toBeNull();
  });

  it('detects unsupported headers and escaped quotes within CSV cells', () => {
    const csv = [
      'vendor_name,description,amount_usd,total_cost',
      '"Acme ""Supply""","Office chairs","$1,250.50",999',
    ].join('\n');

    const parsed = readProcurementCsv(csv);

    expect(parsed.errors).toContain('CSV contains unsupported headers: total_cost');
    expect(parsed.rows[0].vendor_name).toBe('Acme "Supply"');
    expect(parsed.rows[0].amount_usd).toBe(1250.5);
  });
});

describe('Document AI service', () => {
  it('extracts structured procurement items from a parsed document response', async () => {
    const { documentAI } = require('../src/config/gcpClients');
    documentAI.processDocument.mockResolvedValue({
      document: {
        pages: [
          {
            paragraphs: [
              { layout: { textAnchor: { content: 'Acme Supply' } } },
              { layout: { textAnchor: { content: 'Office chairs $1500.00' } } },
            ],
          },
        ],
      },
    });

    const result = await parseProcurementDocument(Buffer.from('dummy pdf'), 'application/pdf');

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ vendor_name: 'Acme Supply' }),
    ]));
  });

  it('handles empty text and fallback parsing when no line items are returned', async () => {
    const { documentAI } = require('../src/config/gcpClients');
    const { parseTextLineItem } = require('../src/services/documentAiService');

    expect(parseTextLineItem('')).toBeNull();
    expect(parseTextLineItem('Acme Supply $1,250.50')).toEqual({
      vendor_name: 'Acme Supply',
      description: 'Procurement line item',
      amount_usd: 1250.5,
      naics_code: null,
    });
    expect(parseTextLineItem('$1,250.50')).toEqual({
      vendor_name: 'Unknown vendor',
      description: 'Procurement line item',
      amount_usd: 1250.5,
      naics_code: null,
    });
    expect(parseTextLineItem('Acme Supply')).toEqual({
      vendor_name: 'Acme Supply',
      description: 'Procurement line item',
      amount_usd: null,
      naics_code: null,
    });

    documentAI.processDocument.mockResolvedValue({
      document: {
        pages: [{ paragraphs: [{ layout: { textAnchor: { content: '' } } }] }],
      },
    });

    const result = await parseProcurementDocument(Buffer.from('dummy pdf'), 'application/pdf');
    expect(result[0]).toEqual(expect.objectContaining({
      vendor_name: 'Unknown vendor',
      description: 'Document AI parsing yielded no line items',
    }));
  });

  it('throws a typed error when the Document AI client is not configured', async () => {
    const { documentAI } = require('../src/config/gcpClients');
    const original = documentAI.processDocument;
    documentAI.processDocument = undefined;

    await expect(parseProcurementDocument(Buffer.from('abc'), 'application/pdf'))
      .rejects.toMatchObject({
        code: 'DOCUMENT_PROCESSOR_NOT_CONFIGURED',
        status: 500,
      });

    documentAI.processDocument = original;
  });

  it('throws a typed error when DOCUMENT_PROCESSOR_ID is missing', async () => {
    const previous = process.env.DOCUMENT_PROCESSOR_ID;
    delete process.env.DOCUMENT_PROCESSOR_ID;

    await expect(parseProcurementDocument(Buffer.from('abc'), 'application/pdf'))
      .rejects.toMatchObject({
        code: 'DOCUMENT_PROCESSOR_NOT_CONFIGURED',
        status: 500,
      });

    if (previous === undefined) {
      delete process.env.DOCUMENT_PROCESSOR_ID;
    } else {
      process.env.DOCUMENT_PROCESSOR_ID = previous;
    }
  });
});

describe('POST /carbon-auditor/upload', () => {
  it('uploads a valid CSV and saves the parsed line items', async () => {
    const saveSpy = jest.spyOn(cloudSqlService, 'saveProcurementLineItems').mockResolvedValue({ inserted: 2 });
    const csv = [
      'vendor_name,description,amount_usd,naics_code',
      'Acme Supply,Office chairs,1500.00,423110',
      'Northwind,Packaging tape,320.45,424690',
    ].join('\n');

    const res = await request(app)
      .post('/carbon-auditor/upload')
      .attach('file', Buffer.from(csv), {
        filename: 'procurement.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(200);
    expect(res.body.totalInserted).toBe(2);
    expect(saveSpy).toHaveBeenCalled();
  });

  it('rejects a non-CSV upload', async () => {
    const res = await request(app)
      .post('/carbon-auditor/upload')
      .attach('file', Buffer.from('not csv'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('rejects a missing upload file', async () => {
    const res = await request(app)
      .post('/carbon-auditor/upload');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('rejects oversized CSV uploads', async () => {
    const res = await request(app)
      .post('/carbon-auditor/upload')
      .attach('file', Buffer.alloc(6 * 1024 * 1024, 'a'), {
        filename: 'big.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
  });

  it('rejects invalid CSV schema', async () => {
    const malformed = 'vendor_name,description,total_cost\nAcme,Desk,250';
    const res = await request(app)
      .post('/carbon-auditor/upload')
      .attach('file', Buffer.from(malformed), {
        filename: 'bad.csv',
        contentType: 'text/csv',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CSV');
  });
});

describe('environment validation', () => {
  it('exposes env getters and accepts all required values', () => {
    process.env.PORT = '9090';

    expect(env.getMissingEnv()).toEqual([]);
    expect(env.assertRequiredEnv()).toBeUndefined();
    expect(env.projectId).toBe('demo-project');
    expect(env.region).toBe('us-central1');
    expect(env.keyFile).toBe('service-account.json');
    expect(env.bucket).toBe('demo-bucket');
    expect(env.bqDataset).toBe('greentrace_data');
    expect(env.geminiModel).toBe('gemini-1.5-pro');
    expect(env.cloudSqlHost).toBe('localhost');
    expect(env.cloudSqlDatabase).toBe('greentrace');
    expect(env.cloudSqlUser).toBe('greentrace_user');
    expect(env.cloudSqlPassword).toBe('secret');
    expect(env.documentProcessorId).toBe('demo-processor');
    expect(env.port).toBe(9090);

    delete process.env.PORT;
  });

  it('throws if required env vars are missing', () => {
    const previous = { ...process.env };
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_REGION;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.STORAGE_BUCKET;
    delete process.env.BQ_DATASET;
    delete process.env.GEMINI_MODEL;

    expect(() => env.assertRequiredEnv()).toThrow('Missing required environment variable(s):');

    Object.assign(process.env, previous);
  });
});

describe('Cloud SQL procurement service', () => {
  it('creates the table and inserts rows when Cloud SQL config is present', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rowCount: 1 }),
    };
    Pool.mockReturnValue(mockPool);

    const result = await cloudSqlService.saveProcurementLineItems([
      { vendor_name: 'Acme', description: 'Desk chairs', amount_usd: 100.5, naics_code: '423110' },
    ]);

    expect(result.inserted).toBe(1);
    expect(mockPool.query).toHaveBeenCalled();
    expect(cloudSqlService.getPool()).toBeDefined();
  });

  it('returns false when Cloud SQL table creation is attempted without config', async () => {
    delete process.env.CLOUDSQL_HOST;
    delete process.env.CLOUDSQL_DB_NAME;
    delete process.env.CLOUDSQL_DB_USER;
    delete process.env.CLOUDSQL_DB_PASSWORD;

    const result = await cloudSqlService.ensureProcurementLineItemsTable();

    expect(result).toBe(false);
    expect(cloudSqlService.getPool()).toBeNull();
  });

  it('returns a skipped result when the Cloud SQL config is missing', async () => {
    delete process.env.CLOUDSQL_HOST;
    delete process.env.CLOUDSQL_DB_NAME;
    delete process.env.CLOUDSQL_DB_USER;
    delete process.env.CLOUDSQL_DB_PASSWORD;

    const result = await cloudSqlService.saveProcurementLineItems([
      { vendor_name: 'Acme', description: 'Desk chairs', amount_usd: 100.5 },
    ]);

    expect(result.skipped).toBe(true);
    expect(result.inserted).toBe(1);
  });

  it('returns zero when no rows are provided', async () => {
    const result = await cloudSqlService.saveProcurementLineItems([]);
    expect(result.inserted).toBe(0);
  });

  it('skips DB writes when Cloud SQL is not configured and rows are nullish', async () => {
    delete process.env.CLOUDSQL_HOST;
    delete process.env.CLOUDSQL_DB_NAME;
    delete process.env.CLOUDSQL_DB_USER;
    delete process.env.CLOUDSQL_DB_PASSWORD;

    const result = await cloudSqlService.saveProcurementLineItems(null);

    expect(result).toEqual({ inserted: 0, skipped: true });
  });
});

describe('GET /health', () => {
  it('returns 200 when the service is ready', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 503 when required env vars are missing', async () => {
    const previous = { ...process.env };
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_REGION;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.STORAGE_BUCKET;
    delete process.env.BQ_DATASET;
    delete process.env.GEMINI_MODEL;

    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');

    Object.assign(process.env, previous);
  });
});

describe('GET /health/gemini', () => {
  it('returns not ready when the Gemini client is unavailable', async () => {
    const gcpClients = require('../src/config/gcpClients');
    const previous = gcpClients.geminiModel;
    gcpClients.geminiModel = null;

    const res = await request(app).get('/health/gemini');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');

    gcpClients.geminiModel = previous;
  });

  it('returns the Gemini response when the client is working', async () => {
    const gcpClients = require('../src/config/gcpClients');
    gcpClients.geminiModel.generateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: 'GreenTrace online' }] } }],
      },
    });

    const res = await request(app).get('/health/gemini');
    expect(res.status).toBe(200);
    expect(res.body.response).toBe('GreenTrace online');
  });

  it('returns 503 when the Gemini client is missing from the runtime config', async () => {
    const gcpClients = require('../src/config/gcpClients');
    gcpClients.geminiModel = null;

    const res = await request(app).get('/health/gemini');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
  });

  it('returns 500 when Gemini generation fails', async () => {
    const gcpClients = require('../src/config/gcpClients');
    gcpClients.geminiModel = {
      generateContent: jest.fn().mockRejectedValueOnce(new Error('Vertex AI unavailable')),
    };

    const res = await request(app).get('/health/gemini');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('coverage edge cases', () => {
  it('uses AppError defaults and custom codes when no status is supplied', () => {
    const AppError = require('../src/middleware/AppError');

    const defaultError = new AppError('Default');
    const customError = new AppError('Custom message', 418, 'TEA_TIME');

    expect(defaultError.status).toBe(400);
    expect(defaultError.code).toBe('BAD_REQUEST');
    expect(customError.status).toBe(418);
    expect(customError.code).toBe('TEA_TIME');
    expect(customError.expose).toBe(true);
  });

  it('hides sensitive error messages when an error is not intentionally exposed', () => {
    const errorHandler = require('../src/middleware/errorHandler');
    const err = new Error('secret failure');
    err.expose = false;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  it('normalizes nullish Cloud SQL values before insertion', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValue({ rowCount: 1 }),
    };
    Pool.mockReturnValue(mockPool);

    const result = await cloudSqlService.saveProcurementLineItems([
      {
        vendor_name: '  Acme   ',
        description: '  Office chairs  ',
        amount_usd: undefined,
        naics_code: '',
      },
    ]);

    expect(result.inserted).toBe(1);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO procurement_line_items'),
      ['Acme', 'Office chairs', null, null],
    );
  });

  it('returns empty-row validation errors for blank or malformed CSV payloads', () => {
    const blank = readProcurementCsv('   \n\n');
    const malformed = readProcurementCsv('vendor_name,description,amount_usd\n"Acme","Desk",');

    expect(blank.errors).toEqual(['CSV file is empty.']);
    expect(malformed.rows[0].amount_usd).toBeNull();
    expect(malformed.rows[0].vendor_name).toBe('Acme');
  });
});
