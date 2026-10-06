'use strict';

const { Router } = require('express');
const multer = require('multer');
const { readProcurementCsv } = require('./procurementCsvValidator');
const cloudSqlService = require('../../services/cloudSqlProcurementService');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file || !file.originalname || !file.originalname.toLowerCase().endsWith('.csv')) {
      return cb(null, false);
    }

    return cb(null, true);
  },
});

class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.expose = true;
  }
}

/**
 * Accepts a procurement CSV upload, validates it, and persists normalized line items.
 * @param {import('express').Request} req - HTTP request containing the uploaded file.
 * @param {import('express').Response} res - HTTP response object.
 * @param {import('express').NextFunction} next - Error-forwarding callback.
 * @returns {Promise<import('express').Response>} JSON success response or forwarded AppError.
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('Only CSV files are allowed for upload.', 400, 'INVALID_FILE');
    }

    if (req.file.size > 5 * 1024 * 1024) {
      throw new AppError('CSV file exceeds 5MB limit.', 400, 'INVALID_FILE');
    }

    const csvString = req.file.buffer.toString('utf8');
    const parsed = readProcurementCsv(csvString);

    if (parsed.errors.length > 0) {
      throw new AppError(parsed.errors[0], 400, 'INVALID_CSV');
    }

    const saved = await cloudSqlService.saveProcurementLineItems(parsed.rows);

    return res.status(200).json({
      status: 'ok',
      totalInserted: saved.inserted || parsed.rows.length,
      rows: parsed.rows,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
