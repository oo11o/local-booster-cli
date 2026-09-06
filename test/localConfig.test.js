import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function withConfig(body, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dzo-'));
  const path = join(dir, 'cfg.json');
  writeFileSync(path, body);
  const prev = process.env.DZO_CONFIG;
  process.env.DZO_CONFIG = path;
  try {
    const mod = await import(`../src/localConfig.js?${Date.now()}`);
    await fn(mod);
  } finally {
    if (prev === undefined) delete process.env.DZO_CONFIG;
    else process.env.DZO_CONFIG = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('local config supplies run and baseUrl', async () => {
  await withConfig('{"run":"secret-key","baseUrl":"https://real.host"}', (m) => {
    const c = m.loadLocalConfig();
    assert.equal(c.run, 'secret-key');
    assert.equal(c.baseUrl, 'https://real.host');
  });
});

test('invalid JSON throws with the path', async () => {
  await withConfig('{ not json', (m) => {
    assert.throws(() => m.loadLocalConfig(), /invalid JSON/);
  });
});
