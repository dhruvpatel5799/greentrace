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

const cloudSqlOptional = [
  'CLOUDSQL_HOST',
  'CLOUDSQL_DB_NAME',
  'CLOUDSQL_DB_USER',
  'CLOUDSQL_DB_PASSWORD',
  'DOCUMENT_PROCESSOR_ID',
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
  cloudSqlOptional,
  getMissingEnv,
  assertRequiredEnv,
  get projectId() {
    return process.env.GCP_PROJECT_ID;
  },
  get region() {
    return process.env.GCP_REGION;
  },
  get keyFile() {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  },
  get bucket() {
    return process.env.STORAGE_BUCKET;
  },
  get bqDataset() {
    return process.env.BQ_DATASET;
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL;
  },
  get cloudSqlHost() {
    return process.env.CLOUDSQL_HOST;
  },
  get cloudSqlDatabase() {
    return process.env.CLOUDSQL_DB_NAME;
  },
  get cloudSqlUser() {
    return process.env.CLOUDSQL_DB_USER;
  },
  get cloudSqlPassword() {
    return process.env.CLOUDSQL_DB_PASSWORD;
  },
  get documentProcessorId() {
    return process.env.DOCUMENT_PROCESSOR_ID;
  },
  get port() {
    return parseInt(process.env.PORT || '8080', 10);
  },
};