'use strict';

const REQUIRED_HEADERS = ['vendor_name', 'description', 'amount_usd'];
const OPTIONAL_HEADERS = ['naics_code'];

/**
 * Splits a CSV row while respecting quoted values and escaped quotes.
 * @param {string} line - Raw CSV row text.
 * @returns {string[]} Parsed cells for the row.
 */
function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value = '') {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Parses a numeric procurement amount from CSV content.
 * @param {string | number | null | undefined} rawValue - Raw value from the CSV.
 * @returns {number | null} Normalized numeric amount or null when unparsable.
 */
function parseAmount(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const numberString = String(rawValue).replace(/[$,]/g, '').trim();
  const amount = Number.parseFloat(numberString);

  return Number.isFinite(amount) ? amount : null;
}

/**
 * Validates and normalizes a procurement CSV payload.
 * @param {string} csvContent - Raw CSV text to parse.
 * @returns {{ headers: string[], rows: Array<{ vendor_name: string, description: string, amount_usd: number | null, naics_code: string | null }>, errors: string[] }}
 * Parsed rows and any schema validation errors.
 */
function readProcurementCsv(csvContent) {
  if (!csvContent || !String(csvContent).trim()) {
    return {
      headers: [],
      rows: [],
      errors: ['CSV file is empty.'],
    };
  }

  const lines = String(csvContent).split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: ['CSV file is empty.'],
    };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const missingRequiredHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  const unexpectedHeaders = headers.filter(
    (header) => ![...REQUIRED_HEADERS, ...OPTIONAL_HEADERS].includes(header),
  );

  const errors = [];

  if (missingRequiredHeaders.length > 0) {
    errors.push(`CSV is missing required headers: ${missingRequiredHeaders.join(', ')}`);
  }

  if (unexpectedHeaders.length > 0) {
    errors.push(`CSV contains unsupported headers: ${unexpectedHeaders.join(', ')}`);
  }

  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const row = {};

    headers.forEach((header, index) => {
      const value = cells[index] ?? '';
      row[header] = value.trim();
    });

    if (Object.values(row).some((value) => value !== '')) {
      const normalizedRow = {
        vendor_name: row.vendor_name || '',
        description: row.description || '',
        amount_usd: parseAmount(row.amount_usd),
        naics_code: row.naics_code || null,
      };

      rows.push(normalizedRow);
    }
  }

  return { headers, rows, errors };
}

module.exports = {
  REQUIRED_HEADERS,
  OPTIONAL_HEADERS,
  readProcurementCsv,
  parseAmount,
};
