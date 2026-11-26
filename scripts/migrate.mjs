import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:local.db',
  authToken: process.env.DATABASE_AUTH_TOKEN
});

function statements(sql) {
  return sql.replace(/--[^\n]*/g, '').split(';').map((item) => item.trim()).filter(Boolean);
}

// Older deployments used _migrations with a different schema. Keep that table
// untouched and use a dedicated tracker for this migration format instead.
const migrationTable = '_word_step_migrations';
await client.execute(`CREATE TABLE IF NOT EXISTS ${migrationTable} (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
const files = (await readdir(join(root, 'db/migrations'))).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();

async function tableColumns(table) {
  const result = await client.execute(`PRAGMA table_info("${table}")`);
  return new Set(result.rows.map((row) => String(row.name)));
}

async function preserveLegacyTable(table) {
  const legacyName = `${table}_legacy_${Date.now()}`;
  await client.execute(`ALTER TABLE "${table}" RENAME TO "${legacyName}"`);
  return legacyName;
}

// The first version of this app used different columns for these tables and
// recorded the migration in the old _migrations table. Keep those records,
// but move the incompatible tables aside so the current schema can be created.
// This also makes upgrades work when _word_step_migrations already says that
// 001_initial.sql was applied.
const requiredColumns = {
  words: ['english', 'japanese', 'chinese', 'phonetic', 'example'],
  test_results: ['identity', 'study_date', 'total_questions', 'correct_answers', 'completed_at']
};
let schemaNeedsBaseline = false;
const legacyTables = {};
for (const [table, required] of Object.entries(requiredColumns)) {
  const columns = await tableColumns(table);
  if (columns.size > 0 && required.some((column) => !columns.has(column))) {
    const legacyName = await preserveLegacyTable(table);
    legacyTables[table] = legacyName;
    console.log(`Preserved legacy ${table} table as ${legacyName}`);
    schemaNeedsBaseline = true;
  }
}
if (schemaNeedsBaseline) {
  await client.execute({ sql: `DELETE FROM ${migrationTable} WHERE filename = ?`, args: ['001_initial.sql'] });
}

for (const filename of files) {
  const existing = await client.execute({ sql: `SELECT 1 FROM ${migrationTable} WHERE filename = ?`, args: [filename] });
  if (existing.rows.length) continue;
  const sql = await readFile(join(root, 'db/migrations', filename), 'utf8');
  await client.batch([
    ...statements(sql),
    { sql: `INSERT INTO ${migrationTable} (filename, applied_at) VALUES (?, ?)`, args: [filename, new Date().toISOString()] }
  ], 'write');
}

const legacyTestResults = legacyTables.test_results;
if (legacyTestResults) {
  // The old authenticated app stored results by user account. Map the family
  // names used there to the identity keys used by the current app.
  await client.execute(`
    INSERT OR IGNORE INTO test_results
      (identity, study_date, total_questions, correct_answers, completed_at)
    SELECT CASE lower(trim(COALESCE(users.name, legacy.user_id)))
      WHEN '爸爸' THEN 'dad'
      WHEN 'dad' THEN 'dad'
      WHEN 'father' THEN 'dad'
      WHEN '妈妈' THEN 'mom'
      WHEN 'mom' THEN 'mom'
      WHEN 'mother' THEN 'mom'
      WHEN 'uu' THEN 'uu'
      ELSE lower(trim(COALESCE(users.name, legacy.user_id)))
    END,
      legacy.test_date,
      legacy.total,
      legacy.score,
      COALESCE(legacy.created_at, CURRENT_TIMESTAMP)
    FROM "${legacyTestResults}" AS legacy
    LEFT JOIN users ON users.id = legacy.user_id
    WHERE lower(trim(COALESCE(users.name, legacy.user_id))) IN
      ('爸爸', 'dad', 'father', '妈妈', 'mom', 'mother', 'uu')
  `);
  console.log(`Migrated legacy test results from ${legacyTestResults}`);
}
await client.close();
