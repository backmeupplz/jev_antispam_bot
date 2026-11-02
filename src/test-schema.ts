// Test preload (bunfig.toml): with `bun test --parallel`, files run at once in several worker processes, and the
// database tests reset and lock the same tables. Each worker gets a schema of its own in the test database (one
// file at a time runs in a worker), so its files see only their own tables.
import pg from "pg";

const urls = ["TEST_DATABASE_URL", "AUDIT_TEST_DATABASE_URL"] as const;
const schema = `test_worker_${process.pid}`;
for (const name of urls) {
  const url = process.env[name];
  if (!url) continue;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`); } finally { await pool.end(); }
  const own = new URL(url); own.searchParams.set("options", `-c search_path=${schema}`);
  process.env[name] = own.toString();
}
