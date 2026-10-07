'use strict';

const AppError = require('../middleware/AppError');
const gcpClients = require('../config/gcpClients');
const env = require('../config/env');

/**
 * Parses a single text block into a procurement line-item structure.
 * @param {string} textBlock - Raw text returned by Document AI.
 * @returns {{ vendor_name: string, description: string, amount_usd: number | null, naics_code: string | null } | null}
 * A normalized line item or null if the text is empty.
 */
function parseTextLineItem(textBlock) {
  const cleaned = String(textBlock || '').trim();
  if (!cleaned) {
    return null;
  }

  const vendorMatch = cleaned.match(/^[A-Za-z0-9&.\-\s]+/);
  const vendorName = vendorMatch ? vendorMatch[0].trim() : null;

  const amountMatch = cleaned.match(/\$?\d+(?:,\d{3})*(?:\.\d+)?/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[0].replace(/[$,]/g, '')) : null;

  const description = cleaned
    .replace(vendorName || '', '')
    .replace(amountMatch ? amountMatch[0] : '', '')
    .replace(/[\s]+/g, ' ')
    .trim();

  if (!vendorName && !description && amount === null) {
    return null;
  }

  return {
    vendor_name: vendorName || 'Unknown vendor',
    description: description || 'Procurement line item',
    amount_usd: amount,
    naics_code: null,
  };
}

/**
 * Calls Document AI and normalizes returned paragraphs into procurement line items.
 * @param {Buffer|string} buffer - Raw document bytes or text payload.
 * @param {string} [mimeType='application/pdf'] - MIME type for the uploaded document.
 * @returns {Promise<Array<{ vendor_name: string, description: string, amount_usd: number, naics_code: string | null }>>}
 * Structured procurement rows ready for downstream storage.
 * @throws {Error} Re-throws any Document AI processing failure.
 */
async function parseProcurementDocument(buffer, mimeType = 'application/pdf') {
  const client = gcpClients.documentAI;

  if (!client || typeof client.processDocument !== 'function') {
    throw new AppError(
      'Document processor is not configured. Set DOCUMENT_PROCESSOR_ID in the environment.',
      500,
      'DOCUMENT_PROCESSOR_NOT_CONFIGURED',
    );
  }

  const processorId = env.documentProcessorId;

  if (!processorId) {
    throw new AppError(
      'Document processor is not configured. Set DOCUMENT_PROCESSOR_ID in the environment.',
      500,
      'DOCUMENT_PROCESSOR_NOT_CONFIGURED',
    );
  }

  const result = await client.processDocument({
    name: processorId,
    rawDocument: {
      content: Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(String(buffer || ''), 'utf8').toString('base64'),
      mimeType,
    },
  });

  const textBlocks = [];
  const pages = result?.document?.pages || [];

  for (const page of pages) {
    const paragraphs = page.paragraphs || [];

    for (const paragraph of paragraphs) {
      const text = paragraph?.layout?.textAnchor?.content || '';
      if (text.trim()) {
        textBlocks.push(text.trim());
      }
    }
  }

  const items = textBlocks
    .map(parseTextLineItem)
    .filter(Boolean);

  return items.length > 0 ? items : [{
    vendor_name: 'Unknown vendor',
    description: 'Document AI parsing yielded no line items',
    amount_usd: 0,
    naics_code: null,
  }];
}

module.exports = {
  parseProcurementDocument,
  parseTextLineItem,
};
