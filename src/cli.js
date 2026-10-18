import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer } from './server.js';
import { loadSettings, saveSettings } from './settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    port: { type: 'string', default: '4317' },
    'no-open': { type: 'boolean', default: false },
  },
});

const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`--port must be a number from 0 to 65535, got "${values.port}"`);

const settingsFile = path.join(root, 'settings.local.json');
if (values.project) {
  const s = loadSettings(settingsFile);
  const p = path.resolve(values.project);
  saveSettings(settingsFile, { ...s, projects: [...s.projects, p], active: p });
}

const pricesFile = path.join(root, 'prices.json');
const server = createServer({
  root,
  settingsFile,
  cacheFile: path.join(root, 'cache', 'parsed.json'),
  claudeRoot: path.join(os.homedir(), '.claude', 'projects'),
  codexRoot: path.join(os.homedir(), '.codex', 'sessions'),
  prices: JSON.parse(fs.readFileSync(pricesFile, 'utf8')),
  pricesFile,
});

server.on('error', e => fail(e.code === 'EADDRINUSE'
  ? `Port ${port} is in use. Close the other program or pass --port <n>.`
  : `Server error: ${e.message}`));

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`AIConfigGraph on ${url}`);
  if (!values['no-open']) openBrowser(url);
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}
