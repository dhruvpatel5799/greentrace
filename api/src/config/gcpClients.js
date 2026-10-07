'use strict';

const { BigQuery } = require('@google-cloud/bigquery');
const { Storage } = require('@google-cloud/storage');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
const { VertexAI } = require('@google-cloud/vertexai');
const env = require('./env');

const missing = env.getMissingEnv();

if (missing.length > 0) {
  module.exports = {
    bigquery: null,
    storage: null,
    secretManager: null,
    documentAI: null,
    geminiModel: null,
    missing,
  };
} else {
  const bigquery = new BigQuery({ projectId: env.projectId });
  const storage = new Storage({ projectId: env.projectId });
  const secretManager = new SecretManagerServiceClient();
  const documentAI = new DocumentProcessorServiceClient();
  const vertexAI = new VertexAI({ project: env.projectId, location: env.region });
  const geminiModel = vertexAI.getGenerativeModel({ model: env.geminiModel });

  module.exports = {
    bigquery,
    storage,
    secretManager,
    documentAI,
    geminiModel,
    missing: [],
  };
}
