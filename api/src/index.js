'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const healthRouter = require('./routes/health');

const app = express();

// --- Security & observability middleware ---
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// --- Routes ---
app.use('/health', healthRouter);

// --- Central error handler (must be last) ---
app.use(errorHandler);

if (require.main === module) {
  app.listen(env.port, () => {
    console.log(`GreenTrace API running on port ${env.port}`);
  });
}

module.exports = app; // exported for supertest in tests