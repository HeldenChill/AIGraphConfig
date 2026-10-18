import fs from 'node:fs';
import path from 'node:path';
import { parseClaudeSession } from './parse/claude.js';
import { parseCodexRollout } from './parse/codex.js';

// Bump when a parser changes what it produces; old cache entries are then dropped.
export const PARSER_VERSION = 3;

// Claude Code turns every non-alphanumeric character of the project path into a dash.
export function claudeSlug(projectPath) {
  return projectPath.replace(/[\\/]+$/, '').replace(/[^a-zA-Z0-9]/g, '-');
}

export function samePath(a, b) {
  const norm = p => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return !!a && !!b && norm(a) === norm(b);
}

// Folder case differs between sessions on the same drive (g-- and G--), so compare without case.
export function findClaudeDirs(projectPath, claudeRoot) {
  if (!fs.existsSync(claudeRoot)) return [];
  const slug = claudeSlug(projectPath).toLowerCase();
  return fs.readdirSync(claudeRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.toLowerCase() === slug)
    .map(e => path.join(claudeRoot, e.name));
}

function listFiles(dir, test) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && test(e.name))
    .map(e => path.join(dir, e.name));
}

function walk(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
}

// Parsed cache stays in memory between scans; the file is only read once per process.
const memory = new Map(); // cacheFile -> cache

function loadCache(cacheFile) {
  if (memory.has(cacheFile)) return memory.get(cacheFile);
  let cache = { version: PARSER_VERSION, files: {} };
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (c.version === PARSER_VERSION) cache = c;
  } catch { /* missing or corrupt cache: start empty */ }
  memory.set(cacheFile, cache);
  return cache;
}

function saveCache(cacheFile, cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  const tmp = cacheFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, cacheFile);
}

// Size and mtime over a main file plus its subagent files, so a subagent change invalidates too.
function stamp(files) {
  let size = 0, mtimeMs = 0;
  for (const f of files) {
    const st = fs.statSync(f);
    size += st.size;
    mtimeMs = Math.max(mtimeMs, st.mtimeMs);
  }
  return { size, mtimeMs };
}

export function scanProject(projectPath, { claudeRoot, codexRoot, cacheFile, onParse }) {
  const cache = loadCache(cacheFile);
  // ponytail: entries for deleted files stay in the cache; prune if the file grows large
  const sessions = [];
  let dirty = false;

  // A file deleted or locked mid-scan (live session on Windows) is skipped, not fatal.
  const safely = (file, fn) => {
    try { fn(); } catch (e) { console.warn(`skipped ${file}: ${e.code || e.message}`); }
  };

  const use = (key, files, parse) => {
    const st = stamp(files);
    const hit = cache.files[key];
    let session;
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
      session = hit.session;
    } else {
      onParse?.(key);
      session = parse();
      cache.files[key] = { ...st, session };
      dirty = true;
    }
    return session;
  };

  for (const dir of findClaudeDirs(projectPath, claudeRoot)) {
    for (const file of listFiles(dir, n => n.endsWith('.jsonl'))) safely(file, () => {
      const id = path.basename(file, '.jsonl');
      const subFiles = listFiles(path.join(dir, id, 'subagents'), n => n.endsWith('.jsonl'));
      const session = use(file, [file, ...subFiles], () => parseClaudeSession(fs.readFileSync(file, 'utf8'), {
        id, file, project: projectPath,
        extraTexts: subFiles.map(f => fs.readFileSync(f, 'utf8')),
      }));
      sessions.push(session);
    });
  }

  // Codex sessions are cached regardless of project, then filtered by their working directory.
  for (const file of walk(codexRoot, n => /^rollout-.*\.jsonl$/.test(n))) safely(file, () => {
    const session = use(file, [file], () => parseCodexRollout(fs.readFileSync(file, 'utf8'), { file }));
    if (samePath(session.project, projectPath)) sessions.push(session);
  });

  if (dirty) saveCache(cacheFile, cache);
  return sessions.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
}
