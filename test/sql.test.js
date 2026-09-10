import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  escapeSqlLiteral,
  renderTemplate,
  buildMysqlCommand,
  parseBatchRows,
  assertReadOnly,
} from '../src/sql.js';

test('assertReadOnly: allows SELECT / WITH / SHOW / EXPLAIN / DESCRIBE', () => {
  for (const sql of [
    'SELECT 1',
    '  select id from t',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'SHOW TABLES',
    'EXPLAIN SELECT 1',
    'DESCRIBE site_tender',
    'SELECT 1;',
  ]) {
    assert.equal(assertReadOnly(sql), sql);
  }
});

test('assertReadOnly: refuses DELETE, DROP, UPDATE, INSERT, TRUNCATE, ALTER', () => {
  for (const sql of [
    'DELETE FROM site_tender',
    'DROP TABLE site_tender',
    'update t set x = 1',
    'INSERT INTO t VALUES (1)',
    'TRUNCATE t',
    'ALTER TABLE t ADD c INT',
  ]) {
    assert.throws(() => assertReadOnly(sql), /only read-only SQL is allowed/);
  }
});

test('assertReadOnly: refuses a write hidden after a SELECT', () => {
  assert.throws(
    () => assertReadOnly('SELECT 1; DROP TABLE site_tender'),
    /only read-only SQL is allowed/,
  );
});

test('assertReadOnly: comment cannot disguise a write verb', () => {
  assert.throws(() => assertReadOnly('/* SELECT */ DROP TABLE t'), /read-only/);
  assert.throws(() => assertReadOnly('-- ok\nDELETE FROM t'), /read-only/);
});

test('assertReadOnly: empty SQL throws', () => {
  assert.throws(() => assertReadOnly('   '), /empty SQL/);
});

test('escapeSqlLiteral: quotes and escapes an apostrophe', () => {
  assert.equal(escapeSqlLiteral("O'Brien"), "'O\\'Brien'");
});

test('escapeSqlLiteral: escapes a backslash', () => {
  assert.equal(escapeSqlLiteral('a\\b'), "'a\\\\b'");
});

test('escapeSqlLiteral: escapes newline and CR', () => {
  assert.equal(escapeSqlLiteral('a\nb\rc'), "'a\\nb\\rc'");
});

test('escapeSqlLiteral: numbers are quoted too', () => {
  assert.equal(escapeSqlLiteral(12345), "'12345'");
});

test('renderTemplate: substitutes a named placeholder', () => {
  const sql = renderTemplate('SELECT id FROM t WHERE tender_id = {{id}} LIMIT 1', {
    id: '12345',
  });
  assert.equal(sql, "SELECT id FROM t WHERE tender_id = '12345' LIMIT 1");
});

test('renderTemplate: throws on a placeholder with no value', () => {
  assert.throws(
    () => renderTemplate('SELECT {{id}}', {}),
    /no value was given/,
  );
});

test('renderTemplate: throws on an unused param', () => {
  assert.throws(
    () => renderTemplate('SELECT {{id}}', { id: '1', extra: '2' }),
    /not used by template/,
  );
});

test('renderTemplate: injection attempt is neutralized as one literal', () => {
  const sql = renderTemplate('SELECT * FROM t WHERE tender_id = {{id}}', {
    id: "1' OR '1'='1",
  });
  assert.equal(sql, "SELECT * FROM t WHERE tender_id = '1\\' OR \\'1\\'=\\'1'");
});

test('buildMysqlCommand: with sudo and batch', () => {
  const cmd = buildMysqlCommand({
    container: 'dzo_site.mysql',
    sudo: true,
    host: '65.109.141.144',
    user: 'sandbox',
    password: 'SomeParol',
    database: 'sandboxdb',
    batch: true,
  });
  assert.equal(
    cmd,
    "MYSQL_PWD='SomeParol' sudo -E docker exec -e MYSQL_PWD -i 'dzo_site.mysql' mysql -h '65.109.141.144' -u 'sandbox' --batch --raw 'sandboxdb'",
  );
});

test('buildMysqlCommand: without sudo or batch', () => {
  const cmd = buildMysqlCommand({
    container: 'dzo_site.mysql',
    sudo: false,
    host: '65.109.141.144',
    user: 'sandbox',
    password: 'SomeParol',
    database: 'sandboxdb',
    batch: false,
  });
  assert.equal(
    cmd,
    "MYSQL_PWD='SomeParol' docker exec -e MYSQL_PWD -i 'dzo_site.mysql' mysql -h '65.109.141.144' -u 'sandbox' 'sandboxdb'",
  );
});

test('parseBatchRows: header + rows, NULL handling', () => {
  const tsv = 'id\ttoken\n1\tabc\n2\tNULL';
  assert.deepEqual(parseBatchRows(tsv), {
    columns: ['id', 'token'],
    rows: [
      { id: '1', token: 'abc' },
      { id: '2', token: null },
    ],
  });
});

test('parseBatchRows: empty result set', () => {
  assert.deepEqual(parseBatchRows(''), { columns: [], rows: [] });
});

test('runQuery: SQL travels on stdin, not in the command string', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dzo-'));
  const path = join(dir, 'cfg.json');
  writeFileSync(
    path,
    JSON.stringify({
      ssh: { host: 'user@stage', options: ['-o', 'BatchMode=yes'] },
      db: {
        container: 'dzo_site.mysql',
        sudo: true,
        host: '65.109.141.144',
        user: 'sandbox',
        password: 'SomeParol',
        database: 'sandboxdb',
      },
    }),
  );
  const prev = process.env.DZO_CONFIG;
  process.env.DZO_CONFIG = path;
  try {
    const mod = await import(`../src/sql.js?${Date.now()}`);
    let seen;
    const fakeExec = async (command, opts) => {
      seen = { command, opts };
      return { stdout: 'ok\n', stderr: '' };
    };
    const sql = "SELECT * FROM t WHERE tender_id = '1' OR '1'='1'";
    const out = await mod.runQuery(sql, { exec: fakeExec });
    assert.equal(out, 'ok\n');
    assert.equal(seen.opts.stdin, sql);
    assert.ok(!seen.command.includes(sql));
    assert.equal(seen.opts.host, 'user@stage');
    assert.deepEqual(seen.opts.options, ['-o', 'BatchMode=yes']);
  } finally {
    if (prev === undefined) delete process.env.DZO_CONFIG;
    else process.env.DZO_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
});
