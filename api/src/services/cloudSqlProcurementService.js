'use strict';

const { Pool } = require('pg');
const env = require('../config/env');

let pool;

function resetPool() {
  pool = null;
}

function getPool() {
  const hasConfig = env.cloudSqlHost && env.cloudSqlDatabase && env.cloudSqlUser && env.cloudSqlPassword;

  if (!hasConfig) {
    pool = null;
    return null;
  }

  if (!pool) {
    pool = new Pool({
      host: env.cloudSqlHost,
      user: env.cloudSqlUser,
      password: env.cloudSqlPassword,
      database: env.cloudSqlDatabase,
      port: 5432,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }

  return pool;
}

async function ensureProcurementLineItemsTable() {
  const connectionPool = getPool();

  if (!connectionPool) {
    return false;
  }

  await connectionPool.query(`
    CREATE TABLE IF NOT EXISTS procurement_line_items (
      id SERIAL PRIMARY KEY,
      vendor_name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      amount_usd NUMERIC(18,2),
      naics_code VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connectionPool.query(`
    CREATE INDEX IF NOT EXISTS idx_procurement_vendor_name
    ON procurement_line_items (vendor_name)
  `);

  await connectionPool.query(`
    CREATE INDEX IF NOT EXISTS idx_procurement_naics_code
    ON procurement_line_items (naics_code)
  `);

  return true;
}

async function saveProcurementLineItems(rows = []) {
  const normalizedRows = (rows || []).map((row) => ({
    vendor_name: String(row.vendor_name || '').trim(),
    description: String(row.description || '').trim(),
    amount_usd: row.amount_usd === null || row.amount_usd === undefined || row.amount_usd === ''
      ? null
      : Number(row.amount_usd),
    naics_code: row.naics_code ? String(row.naics_code).trim() : null,
  }));

  const connectionPool = getPool();

  if (!connectionPool) {
    return { inserted: normalizedRows.length, skipped: true };
  }

  await ensureProcurementLineItemsTable();

  if (normalizedRows.length === 0) {
    return { inserted: 0 };
  }

  const sql = `
    INSERT INTO procurement_line_items (vendor_name, description, amount_usd, naics_code)
    VALUES ($1, $2, $3, $4)
  `;

  const results = await Promise.all(
    normalizedRows.map((row) => connectionPool.query(sql, [
      row.vendor_name,
      row.description,
      row.amount_usd,
      row.naics_code,
    ])),
  );

  const inserted = results.reduce((total, result) => total + Number(result?.rowCount || 1), 0);
  return { inserted };
}

module.exports = {
  getPool,
  resetPool,
  ensureProcurementLineItemsTable,
  saveProcurementLineItems,
};
