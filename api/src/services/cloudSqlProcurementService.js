'use strict';

const mysql = require('mysql2/promise');
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
    pool = mysql.createPool({
      host: env.cloudSqlHost,
      user: env.cloudSqlUser,
      password: env.cloudSqlPassword,
      database: env.cloudSqlDatabase,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }

  return pool;
}

async function ensureProcurementLineItemsTable() {
  const connectionPool = getPool();

  if (!connectionPool) {
    return false;
  }

  await connectionPool.execute(`
    CREATE TABLE IF NOT EXISTS procurement_line_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vendor_name VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      amount_usd DECIMAL(18,2) NOT NULL,
      naics_code VARCHAR(20) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vendor_name (vendor_name),
      INDEX idx_naics_code (naics_code)
    )
  `);

  return true;
}

async function saveProcurementLineItems(rows = []) {
  const normalizedRows = (rows || []).map((row) => ({
    vendor_name: String(row.vendor_name || '').trim(),
    description: String(row.description || '').trim(),
    amount_usd: Number(row.amount_usd ?? 0),
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
    VALUES ?
  `;

  const values = normalizedRows.map((row) => [
    row.vendor_name,
    row.description,
    row.amount_usd,
    row.naics_code,
  ]);

  const [result] = await connectionPool.query(sql, [values]);
  return { inserted: result.affectedRows || normalizedRows.length };
}

module.exports = {
  getPool,
  resetPool,
  ensureProcurementLineItemsTable,
  saveProcurementLineItems,
};
