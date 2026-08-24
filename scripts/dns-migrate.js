#!/usr/bin/env node

const { Pool } = require("pg");
const fs = require("node:fs/promises");
const path = require("node:path");
const { createDnsStore } = require("../lib/dns-store");

function databaseConfig() {
  const connectionString = process.env.DNS_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DNS_DATABASE_URL or DATABASE_URL is required");
  }

  const sslMode = String(process.env.DNS_DATABASE_SSL || process.env.PGSSLMODE || "").toLowerCase();
  const ssl = ["1", "true", "require", "verify-ca", "verify-full"].includes(sslMode)
    ? { rejectUnauthorized: !["1", "true", "require"].includes(sslMode) }
    : undefined;
  return { connectionString, ...(ssl ? { ssl } : {}) };
}

async function main() {
  const pool = new Pool(databaseConfig());
  try {
    const store = createDnsStore(pool);
    const result = await store.init();
    console.log(`[dns-migrate] applied ${result.migrationPath}`);
    const coordinationPath = path.resolve(__dirname, "..", "dns-worker", "sql", "001_source_coordination.sql");
    try {
      await pool.query(await fs.readFile(coordinationPath, "utf8"));
      console.log(`[dns-migrate] applied ${coordinationPath}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[dns-migrate] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { databaseConfig, main };
