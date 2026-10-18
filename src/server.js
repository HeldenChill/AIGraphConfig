import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { scanProject } from './scan.js';
import { priceSession } from './prices.js';
import { loadSettings, saveSettings } from './settings.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const MAX_BODY = 64 * 1024;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': TYPES['.json'], 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      // Keep draining past the limit (destroying the socket would kill the 413 response too).
      if (size > MAX_BODY) reject(Object.assign(new Error('body too large'), { status: 413 }));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function summary(s) {
  return {
    id: s.id, client: s.client, title: s.title, model: s.model, start: s.start,
    promptCount: s.prompts.length, totals: s.totals, cost: s.cost, unpriced: s.unpriced,
  };
}

// ctx = { root, settingsFile, cacheFile, claudeRoot, codexRoot, prices, pricesFile }
export function createServer(ctx) {
  const publicDir = path.join(ctx.root, 'public');
  let last = { project: null, sessions: [], scannedAt: null };

  const scan = () => {
    const { active } = loadSettings(ctx.settingsFile);
    const sessions = active ? scanProject(active, ctx) : [];
    last = { project: active, sessions, scannedAt: new Date().toISOString() };
    return last;
  };

  async function handle(req, res, url) {
    if (url.pathname === '/api/sessions' && req.method === 'GET') {
      const { project, sessions, scannedAt } = scan();
      const client = url.searchParams.get('client');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const day = s => (s.start || '').slice(0, 10);
      const picked = sessions
        .filter(s => !client || s.client === client)
        .filter(s => !from || day(s) >= from)
        .filter(s => !to || day(s) <= to)
        .map(s => priceSession(s, ctx.prices));
      const unpriced = [...new Set(picked.flatMap(s => s.unpriced))].sort();
      return send(res, 200, { project, scannedAt, unpriced, sessions: picked.map(summary) });
    }

    const m = url.pathname.match(/^\/api\/session\/(claude|codex)\/([^/]+)$/);
    if (m && req.method === 'GET') {
      // Rescan (cheap: parsed cache is in memory) so new sessions and a switched project are seen.
      const s = scan().sessions.find(x => x.client === m[1] && x.id === decodeURIComponent(m[2]));
      return s ? send(res, 200, priceSession(s, ctx.prices)) : send(res, 404, { error: 'not found' });
    }

    if (url.pathname === '/api/settings' && req.method === 'GET') {
      return send(res, 200, { ...loadSettings(ctx.settingsFile), pricesFile: ctx.pricesFile ?? null, scannedAt: last.scannedAt });
    }

    if (url.pathname === '/api/settings' && req.method === 'POST') {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'json only' });
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, e.status || 400, { error: e.message }); }
      return send(res, 200, saveSettings(ctx.settingsFile, { ...loadSettings(ctx.settingsFile), ...body }));
    }

    if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
    return serveStatic(res, url.pathname);
  }

  function serveStatic(res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { return send(res, 404, { error: 'not found' }); }
    if (rel === '/') rel = '/index.html';
    const file = path.join(publicDir, rel);
    if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return send(res, 404, { error: 'not found' });
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => {
    // Only this machine's own origin; blocks DNS-rebinding pages from reading the API.
    const port = server.address().port;
    const host = req.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, { error: 'bad host' });
    handle(req, res, new URL(req.url, `http://${host}`))
      .catch(e => send(res, 500, { error: String(e.message || e) }));
  });
  return server;
}
