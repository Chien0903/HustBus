/**
 * Run a .sql file against Postgres using DATABASE_URL (no psql required).
 *
 * Usage:
 *   node scripts/run-sql-file.js db_migration/sample_users.sql
 *
 * Env:
 *   DATABASE_URL (required)
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const relPath = process.argv[2];
  if (!relPath) {
    console.error("❌ Thiếu đường dẫn file .sql");
    console.error("   Ví dụ: node scripts/run-sql-file.js db_migration/sample_users.sql");
    process.exitCode = 1;
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL chưa được set trong môi trường/.env");
    process.exitCode = 1;
    return;
  }

  const sqlPath = path.isAbsolute(relPath)
    ? relPath
    : path.join(__dirname, "..", relPath);

  if (!fs.existsSync(sqlPath)) {
    console.error(`❌ Không tìm thấy file: ${sqlPath}`);
    process.exitCode = 1;
    return;
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  if (!sql.trim()) {
    console.error("❌ File .sql rỗng");
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: databaseUrl });

  console.log(`🔌 Connecting DB...`);
  await client.connect();

  try {
    console.log(`📄 Running SQL file: ${path.relative(process.cwd(), sqlPath)}`);
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ SQL failed:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
