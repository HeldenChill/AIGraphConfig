import os from 'node:os';
import path from 'node:path';

// Node id and path compare form: absolute, forward slashes, lower case, no trailing slash.
export function normPath(p) {
  return path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

// A file name or path that may name a node (x.md, x.mdc, x.js, a/b/x.md, G:\a\x.md), or a bare mem- stem.
export const NAME_TOKEN = /(?:[\w.~:-]+[\\/])*[\w.-]+\.(?:mdc|md|js)\b|\bmem-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/gi;

export const namedIn = text => [...new Set(text.match(NAME_TOKEN) || [])];

// `| HUB: label | `file` |` rows of the memory index.
export function hubRows(indexText) {
  const rows = [];
  for (const line of indexText.split('\n')) {
    const m = line.match(/^\|\s*HUB:\s*(.+?)\s*\|\s*`([^`]+)`/);
    if (m) rows.push({ label: m[1], file: m[2] });
  }
  return rows;
}

// First backticked token on the first `**Parent:**` line, without a .md ending.
export function parentOf(text) {
  const m = text.match(/^\*\*Parent:\*\*[^`\n]*`([^`]+)`/m);
  return m ? m[1].replace(/\.md$/i, '') : null;
}

export function frameworkOrigin(text) {
  const head = text.split('\n', 5).join('\n');
  const m = head.match(/GENERATED from (com\.hung\.[\w.-]+@[\w.-]+)/);
  return m ? m[1] : null;
}

export function alwaysApply(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return !!m && /^alwaysApply:\s*true\s*$/m.test(m[1]);
}

// Memory index path from the memory-first-workflow rule's PROJECT CONFIG, relative to the project.
export function indexPathFrom(ruleText) {
  const m = ruleText?.match(/MEMORY_MASTER_INDEX\s*=\s*(\S+)/);
  return m ? m[1] : '.cursor/memory/mem-arch-assemblies-canonical.md';
}

export function titleOf(text, file) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : path.basename(file);
}

export function labelOf(file) {
  const base = path.basename(file);
  if (/^SKILL\.md$/i.test(base)) return path.basename(path.dirname(file));
  return base.replace(/\.(md|mdc)$/i, '');
}

const SCRIPT = /("[^"]+\.(?:js|mjs|cjs|ps1|sh|py|cmd)"|[^\s"]+\.(?:js|mjs|cjs|ps1|sh|py|cmd))(?=\s|$)/i;

// The script file a hook command runs, with ${VAR} and $VAR expanded from vars, a leading ~ expanded
// to the home folder and a relative path resolved against base (the hook's working folder); null when none.
export function scriptOf(command, vars = {}, base = process.cwd()) {
  const m = command.match(SCRIPT);
  if (!m) return null;
  let p = m[1].replace(/^"|"$/g, '');
  p = p.replace(/\$\{(\w+)\}|\$(\w+)/g, (all, a, b) => vars[a || b] ?? all);
  p = p.replace(/^~(?=[\\/])/, os.homedir());
  return /\$/.test(p) ? null : path.resolve(base, p);
}

// Hook entries of a settings.json, hooks.json or plugin.json object.
export function hookEntries(json, vars, source, base) {
  const out = [];
  for (const [event, groups] of Object.entries(json?.hooks || {})) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) for (const h of g.hooks || []) {
      if (typeof h.command !== 'string') continue;
      out.push({ event, command: h.command, statusMessage: h.statusMessage ?? null, script: scriptOf(h.command, vars, base), source });
    }
  }
  return out;
}
