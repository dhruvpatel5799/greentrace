'use strict';

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (keyFile && !path.isAbsolute(keyFile)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(
    __dirname,
    '../../../',
    keyFile,
  );
}

const required = [
  'GCP_PROJECT_ID',
  'GCP_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'STORAGE_BUCKET',
  'BQ_DATASET',
  'GEMINI_MODEL',
];

function getMissingEnv() {
  return required.filter((key) => !process.env[key]);
}

function assertRequiredEnv() {
  const missing = getMissingEnv();

  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

module.exports = {
  required,
  getMissingEnv,
  assertRequiredEnv,
  projectId: process.env.GCP_PROJECT_ID,
  region: process.env.GCP_REGION,
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  bucket: process.env.STORAGE_BUCKET,
  bqDataset: process.env.BQ_DATASET,
  geminiModel: process.env.GEMINI_MODEL,
  port: parseInt(process.env.PORT || '8080', 10),
};