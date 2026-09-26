/**
 * Applies SQL files from migrations/ that have not been applied yet, recording them in
 * public._bidsure_migrations. Uses DATABASE_URL from database/.env.
 *   npm run migrate            # apply pending
 *   npm run migrate -- --check # connectivity check only
 */
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing in database/.env');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const { rows } = await client.query('select current_user, version()');
console.log(`Connected as ${rows[0].current_user} — ${String(rows[0].version).split(',')[0]}`);
if (process.argv.includes('--check')) {
  await client.end();
  process.exit(0);
}

await client.query('create table if not exists public._bidsure_migrations (name text primary key, applied_at timestamptz not null default now())');
const applied = new Set((await client.query('select name from public._bidsure_migrations')).rows.map((r) => r.name));
const dir = new URL('./migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
// The two original schema files were applied before this runner existed.
const baseline = ['20260907140000_csap_schema.sql', '20260907141000_csap_schema_fixes.sql'];
for (const f of baseline) if (!applied.has(f)) await client.query('insert into public._bidsure_migrations(name) values ($1) on conflict do nothing', [f]), applied.add(f);

for (const f of files) {
  if (applied.has(f)) continue;
  console.log(`Applying ${f} …`);
  await client.query('begin');
  try {
    await client.query(readFileSync(new URL(f, dir), 'utf8'));
    await client.query('insert into public._bidsure_migrations(name) values ($1)', [f]);
    await client.query('commit');
    console.log(`  ✓ ${f}`);
  } catch (err) {
    await client.query('rollback');
    console.error(`  ✗ ${f}: ${(err as Error).message}`);
    process.exitCode = 1;
    break;
  }
}
await client.end();
