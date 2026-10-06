'use strict';

/**
 * Central error handler — maps thrown errors to a consistent JSON response.
 * Attach as the last middleware in index.js.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let status = err.status || err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.expose ? err.message : 'An unexpected error occurred';

  if (err && (err.code === 'LIMIT_FILE_SIZE' || err.name === 'MulterError')) {
    status = 400;
    code = 'INVALID_FILE';
    message = err.message || 'CSV file exceeds 5MB limit.';
  }

  console.error(`[${code}] ${err.message}`, { stack: err.stack });

  res.status(status).json({ error: { code, message } });
}

module.exports = errorHandler;