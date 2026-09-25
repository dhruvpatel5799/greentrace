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
  const status  = err.status || err.statusCode || 500;
  const code    = err.code   || 'INTERNAL_ERROR';
  const message = err.expose ? err.message : 'An unexpected error occurred';

  console.error(`[${code}] ${err.message}`, { stack: err.stack });

  res.status(status).json({ error: { code, message } });
}

module.exports = errorHandler;