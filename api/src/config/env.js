'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (keyFile && !path.isAbsolute(keyFile)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, '../../../', keyFile);
}

const required = [
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'STORAGE_BUCKET',
  'BQ_DATASET',
  'GEMINI_MODEL',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  projectId: process.env.GCP_PROJECT_ID,
  region: process.env.GCP_REGION,
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  bucket: process.env.STORAGE_BUCKET,
  bqDataset: process.env.BQ_DATASET,
  geminiModel: process.env.GEMINI_MODEL,
  port: parseInt(process.env.PORT || '8080', 10),
};