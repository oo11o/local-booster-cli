import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSyncResponse } from '../src/parse.js';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('xdebug warning dump followed by JSON payload', () => {
  const r = parseSyncResponse(fixture('xdebug-json.txt'));
  assert.deepEqual(r, { status: 'ok', id: '77160', action: 'update' });
});

test('{main} in the call stack is never mistaken for the payload', () => {
  const r = parseSyncResponse(fixture('xdebug-json.txt'));
  assert.equal(r.status, 'ok');
  assert.equal(r.id, '77160');
});

test('bare JSON "add" payload (newly created record)', () => {
  assert.deepEqual(parseSyncResponse('{"add":77188}'), {
    status: 'ok',
    id: '77188',
    action: 'add',
  });
});

test('xdebug dump followed by "add" payload', () => {
  const body =
    "<font><table><tr><td>{main}( )</td></tr></table></font>\n{\"add\":77188}";
  assert.deepEqual(parseSyncResponse(body), {
    status: 'ok',
    id: '77188',
    action: 'add',
  });
});

test('bare false', () => {
  assert.deepEqual(parseSyncResponse(fixture('false.txt')), { status: 'false' });
});

test('bare JSON payload', () => {
  assert.deepEqual(parseSyncResponse(fixture('plain-json.txt')), {
    status: 'ok',
    id: '77160',
    action: 'update',
  });
});

test('HTML-only body with no payload', () => {
  const r = parseSyncResponse(fixture('html-only.txt'));
  assert.equal(r.status, 'unknown');
  assert.doesNotMatch(r.raw, /"update"/);
});

test('payload with trailing PHP output after it', () => {
  assert.deepEqual(parseSyncResponse(fixture('trailing-output.txt')), {
    status: 'ok',
    id: '77160',
    action: 'update',
  });
});

test('false is detected before brace hunting even with {main} present', () => {
  const body = "<table><tr><td>{main}()</td></tr></table>\nfalse";
  assert.deepEqual(parseSyncResponse(body), { status: 'false' });
});
