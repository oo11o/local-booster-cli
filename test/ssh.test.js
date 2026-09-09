import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSshArgs } from '../src/ssh.js';

test('buildSshArgs: host + command, no extra options', () => {
  const args = buildSshArgs({ host: 'user@host', command: 'echo hi' });
  assert.deepEqual(args, ['user@host', 'echo hi']);
});

test('buildSshArgs: extra options come before host', () => {
  const args = buildSshArgs({
    host: 'user@host',
    options: ['-o', 'BatchMode=yes'],
    command: 'echo hi',
  });
  assert.deepEqual(args, ['-o', 'BatchMode=yes', 'user@host', 'echo hi']);
});

test('buildSshArgs: no command omits trailing arg', () => {
  const args = buildSshArgs({ host: 'user@host' });
  assert.deepEqual(args, ['user@host']);
});

test('buildSshArgs: missing host throws', () => {
  assert.throws(() => buildSshArgs({ command: 'echo hi' }), /host is required/);
});
