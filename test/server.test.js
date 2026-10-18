import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { saveSettings } from '../src/settings.js';
import { fakeLogs } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = fakeLogs();
const settingsFile = path.join(f.dir, 'settings.local.json');
saveSettings(settingsFile, { projects: ['G:\\Proj'], active: 'G:\\Proj' });
const prices = { models: { 'claude-test-1': { input: 1, output: 1, cacheWrite5m: 1, cacheWrite1h: 1, cacheRead: 1 } } };
const server = createServer({ ...f, root, settingsFile, prices, pricesFile: 'prices.json' });

test.before(() => new Promise(r => server.listen(0, '127.0.0.1', r)));
test.after(() => server.close());

function request(method, urlPath, { body, host, type = 'application/json' } = {}) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, method, path: urlPath,
      headers: { host: host ?? `127.0.0.1:${port}`, ...(body ? { 'content-type': type } : {}) },
    }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* static file */ }
        resolve({ status: res.statusCode, body: json, text, type: res.headers['content-type'] });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
const get = (p, o) => request('GET', p, o);
const post = (p, body, o) => request('POST', p, { ...o, body });

test('lists sessions with cost and unpriced models', async () => {
  const r = await get('/api/sessions');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.sessions.map(s => s.id).sort(), ['cx1', 's1']);
  // fresh 26 + write 5m 50 + write 1h 1000 + read 3100 + output 31, all at $1 per million
  assert.ok(Math.abs(r.body.sessions.find(s => s.id === 's1').cost - 4207 / 1e6) < 1e-12);
  assert.deepEqual(r.body.unpriced, ['gpt-test', 'gpt-test-2']);
});

test('client filter', async () => {
  const r = await get('/api/sessions?client=codex');
  assert.deepEqual(r.body.sessions.map(s => s.id), ['cx1']);
});

test('one session with prompts', async () => {
  const r = await get('/api/session/claude/s1');
  assert.equal(r.status, 200);
  assert.equal(r.body.prompts.length, 3);
});

test('unknown session 404', async () => {
  assert.equal((await get('/api/session/claude/nope')).status, 404);
});

test('static index served, traversal blocked', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.type, /text\/html/);
  assert.equal((await get('/..%2Fpackage.json')).status, 404);
});

test('foreign Host header rejected', async () => {
  assert.equal((await get('/api/sessions', { host: 'evil.test' })).status, 403);
});

test('POST settings sanitizes and needs JSON', async () => {
  const r = await post('/api/settings', { theme: 'Z' });
  assert.equal(r.body.theme, 'A');
  assert.deepEqual(r.body.projects, ['G:\\Proj']);
  assert.equal((await post('/api/settings', 'theme=B', { type: 'text/plain' })).status, 415);
  assert.equal((await post('/api/settings', '{bad')).status, 400);
});

test('session created after the last list scan is found by a rescan on miss', async () => {
  await get('/api/sessions');
  fs.copyFileSync(path.join(f.claudeDir, 's1.jsonl'), path.join(f.claudeDir, 's2.jsonl'));
  assert.equal((await get('/api/session/claude/s2')).status, 200);
});

test('oversized POST gets 413', async () => {
  assert.equal((await post('/api/settings', JSON.stringify({ x: 'a'.repeat(70 * 1024) }))).status, 413);
});
