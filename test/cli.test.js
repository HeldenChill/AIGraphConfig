import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cli.js');
const run = (...args) => spawnSync(process.execPath, [cli, '--no-open', ...args], { encoding: 'utf8', timeout: 10000 });

test('bad --port exits 1 with a message', () => {
  const r = run('--port', 'abc');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--port must be/);
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
});

test('port in use exits 1 with a message, no stack trace', async () => {
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '127.0.0.1', r));
  const port = String(blocker.address().port);
  const r = spawnSync(process.execPath, [cli, '--no-open', '--port', port], { encoding: 'utf8', timeout: 10000 });
  blocker.close();
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`${port} is in use`));
  assert.doesNotMatch(r.stderr, /at .*\.js:\d+/);
});
