/** Prints the Realtime publication, storage bucket and pipeline table columns. */
import { readFileSync } from 'node:fs';
import pg from 'pg';
const url = readFileSync(new URL('./.env', import.meta.url), 'utf8').match(/DATABASE_URL=(.*)/)![1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
console.log('realtime tables:', (await c.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1")).rows.map((r) => r.tablename).join(', '));
console.log('bucket:', JSON.stringify((await c.query("select id, public, file_size_limit, allowed_mime_types from storage.buckets where id='bid-documents'")).rows));
console.log('runs columns:', (await c.query("select column_name from information_schema.columns where table_name='document_verification_runs' order by ordinal_position")).rows.map((r) => r.column_name).join(', '));
console.log('migrations:', (await c.query('select name from public._bidsure_migrations order by 1')).rows.map((r) => r.name).join(', '));
await c.end();
