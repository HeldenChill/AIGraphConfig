import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/server.js';
import { saveSettings } from '../src/settings.js';
import { normPath } from '../src/graph/classify.js';
import { fakeLogs, fakeConfig } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logs = fakeLogs();
const cfg = fakeConfig();
const settingsFile = path.join(logs.dir, 'settings.local.json');
saveSettings(settingsFile, { projects: [cfg.project], active: cfg.project });
const server = createServer({ ...logs, ...cfg, root, settingsFile, prices: { models: {} }, pricesFile: 'prices.json' });

test.before(() => new Promise(r => server.listen(0, '127.0.0.1', r)));
test.after(() => server.close());

function get(urlPath) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: urlPath, headers: { host: `127.0.0.1:${port}` } }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    }).on('error', reject);
  });
}

test('GET /api/graph returns nodes, edges, groups, usage; no hook list', async () => {
  const r = await get('/api/graph');
  assert.equal(r.status, 200);
  assert.equal(r.body.project, cfg.project);
  assert.ok(r.body.nodes.some(n => n.id === normPath(path.join(cfg.project, 'CLAUDE.md'))));
  assert.ok(r.body.edges.length > 0);
  assert.ok(r.body.groups.some(g => g.id === 'unfiled'));
  assert.deepEqual(r.body.usage, {});
  assert.equal(r.body.overlay, null);
  assert.deepEqual(r.body.sessions, []);
  assert.equal(r.body.hooks, undefined);
});

test('GET /api/file serves graph files with refs, refuses anything else', async () => {
  const id = normPath(path.join(cfg.project, 'CLAUDE.md'));
  const r = await get('/api/file?id=' + encodeURIComponent(id));
  assert.equal(r.status, 200);
  assert.match(r.body.text, /^# Proj/);
  assert.deepEqual(r.body.refs, {
    '.claude/rules/r1.md': normPath(path.join(cfg.project, '.claude', 'rules', 'r1.md')),
    'mem-alpha.md': normPath(path.join(cfg.project, '.cursor', 'memory', 'mem-alpha.md')),
  });
  assert.equal((await get('/api/file?id=' + encodeURIComponent(normPath(path.join(root, 'package.json'))))).status, 404);
  assert.equal((await get('/api/file?id=client%3Aclaude')).status, 404);
  assert.equal((await get('/api/file')).status, 404);
});
