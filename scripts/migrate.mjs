#!/usr/bin/env node
/**
 * 迁移脚本：按文件名顺序执行 migrations/*.sql，已执行过的记录在 schema_migrations。
 * 用法：DATABASE_URL=... node scripts/migrate.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('缺少 DATABASE_URL');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`create table if not exists schema_migrations (
  version text primary key, applied_at timestamptz not null default now())`);

const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const done = new Set((await client.query('select version from schema_migrations')).rows.map((r) => r.version));

for (const file of files) {
  if (done.has(file)) {
    console.log(`skip    ${file}`);
    continue;
  }
  const sql = await readFile(path.join(dir, file), 'utf8');
  process.stdout.write(`apply   ${file} ... `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('insert into schema_migrations (version) values ($1)', [file]);
    await client.query('commit');
    console.log('ok');
  } catch (err) {
    await client.query('rollback');
    console.error(`\n失败：${err.message}`);
    process.exit(1);
  }
}

await client.end();
console.log('迁移完成');
