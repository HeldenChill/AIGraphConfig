import fs from 'node:fs';
import path from 'node:path';
import { normPath, hookEntries, indexPathFrom } from './classify.js';
import { findClaudeDirs } from '../scan.js';

const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

function list(dir, test) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && test(e.name)).map(e => path.join(dir, e.name));
  } catch { return []; }
}

function walk(dir, test, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, test, out);
    else if (test(e.name)) out.push(p);
  }
  return out;
}

const skillsIn = dir => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => path.join(dir, e.name, 'SKILL.md')).filter(isFile);
  } catch { return []; }
};
const md = n => /\.md$/i.test(n);

// Universal and generated paths from the shared repo manifest, relative to a project root.
function manifestSets(sharedDir) {
  const m = sharedDir ? readJson(path.join(sharedDir, 'manifest.json')) : null;
  const universal = new Set();
  const generated = new Set();
  for (const f of m?.files || []) for (const d of f.dest || []) universal.add(d.replace(/\\/g, '/').toLowerCase());
  for (const g of m?.generated || []) if (typeof g === 'string') generated.add(g.replace(/\\/g, '/').toLowerCase());
  return { universal, generated };
}

function enabledPlugins(claudeHome) {
  const enabled = readJson(path.join(claudeHome, 'settings.json'))?.enabledPlugins || {};
  const installed = readJson(path.join(claudeHome, 'plugins', 'installed_plugins.json')) || {};
  const all = installed.plugins || installed;
  const out = [];
  for (const [key, on] of Object.entries(enabled)) {
    const dir = on && Array.isArray(all[key]) ? all[key][0]?.installPath : null;
    if (dir && fs.existsSync(dir)) out.push({ name: key.split('@')[0], dir });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Every config file the graph shows, plus every hook entry. Reads folders only; file text is read by build.
// ctx = { project, claudeHome, codexHome, sharedDir, showDocs }
export function collectFiles({ project, claudeHome, codexHome, sharedDir, showDocs }) {
  const files = new Map(); // normPath -> FileEntry
  const hooks = [];
  const { universal, generated } = manifestSets(sharedDir);

  const add = (p, type, extra = {}) => {
    const id = normPath(p);
    if (files.has(id) || !isFile(p)) return;
    let origin = extra.group ? extra.origin : 'project';
    if (!extra.group) {
      const rel = path.relative(project, p).replace(/\\/g, '/').toLowerCase();
      if (universal.has(rel)) origin = 'universal';
      else if (generated.has(rel)) origin = 'generated';
    }
    files.set(id, { id, path: path.resolve(p), type, originLabel: null, group: null, client: null, load: null, skill: null, ...extra, origin });
  };
  const at = (...parts) => path.join(project, ...parts);

  // Project
  add(at('CLAUDE.md'), 'entry', { client: 'claude', load: 'startup' });
  add(at('AGENTS.md'), 'entry', { client: 'codex', load: 'startup' });
  add(at('GEMINI.md'), 'entry', { client: 'gemini', load: 'startup' });
  for (const p of list(at('.claude', 'rules'), md)) add(p, 'rule', { client: 'claude', load: 'startup' });
  for (const p of list(at('.cursor', 'rules'), n => /\.mdc$/i.test(n))) add(p, 'cursor-rule', { client: 'cursor' });

  const vars = { CLAUDE_PROJECT_DIR: project };
  // Claude Code runs every hook (project, global, plugin) with the project as its working folder.
  for (const h of hookEntries(readJson(at('.claude', 'settings.json')), vars, 'project', project)) hooks.push({ ...h, group: null });
  for (const p of list(at('.claude', 'hooks'), n => /\.(js|mjs|cjs|ps1|sh|py|cmd)$/i.test(n))) add(p, 'hook', { client: 'claude', load: 'hook' });

  const ruleText = isFile(at('.claude', 'rules', 'memory-first-workflow.md'))
    ? fs.readFileSync(at('.claude', 'rules', 'memory-first-workflow.md'), 'utf8') : null;
  // The index must be a .md inside the project, so a repo's rule cannot pull an outside file into /api/file.
  let indexPath = path.resolve(project, indexPathFrom(ruleText));
  const indexRel = path.relative(project, indexPath);
  if (indexRel.startsWith('..') || path.isAbsolute(indexRel) || !md(indexPath)) indexPath = path.resolve(project, indexPathFrom(null));
  add(indexPath, 'index');
  for (const p of walk(at('.cursor', 'memory'), md)) add(p, 'memory');
  for (const p of walk(at('.cursor', 'playbooks'), md)) add(p, 'playbook');
  for (const [dir, client] of [[at('.claude', 'skills'), 'claude'], [at('.agents', 'skills'), 'codex'], [at('.codex', 'skills'), 'codex'], [at('.cursor', 'skills'), 'cursor']]) {
    for (const p of skillsIn(dir)) add(p, 'skill', { client, load: 'on-demand', skill: path.basename(path.dirname(p)) });
  }
  for (const p of list(at('.claude', 'agents'), md)) add(p, 'agent', { client: 'claude', load: 'on-demand' });
  if (showDocs) for (const p of walk(at('docs'), md)) add(p, 'doc');

  // Global Claude
  const gc = { group: 'outside:claude-global', origin: 'global' };
  add(path.join(claudeHome, 'CLAUDE.md'), 'entry', { ...gc, client: 'claude', load: 'startup' });
  for (const dir of findClaudeDirs(project, path.join(claudeHome, 'projects'))) {
    for (const p of list(path.join(dir, 'memory'), md)) {
      const isIndex = /^MEMORY\.md$/i.test(path.basename(p));
      add(p, isIndex ? 'index' : 'memory', isIndex ? { ...gc, client: 'claude', load: 'startup' } : gc);
    }
  }
  for (const p of skillsIn(path.join(claudeHome, 'skills'))) add(p, 'skill', { ...gc, client: 'claude', load: 'on-demand', skill: path.basename(path.dirname(p)) });
  for (const h of hookEntries(readJson(path.join(claudeHome, 'settings.json')), {}, 'global', project)) hooks.push({ ...h, group: gc.group });

  // Global Codex
  const gx = { group: 'outside:codex-global', origin: 'global' };
  add(path.join(codexHome, 'AGENTS.md'), 'entry', { ...gx, client: 'codex', load: 'startup' });
  for (const p of skillsIn(path.join(codexHome, 'skills'))) add(p, 'skill', { ...gx, client: 'codex', load: 'on-demand', skill: path.basename(path.dirname(p)) });

  // Enabled Claude plugins
  for (const pl of enabledPlugins(claudeHome)) {
    const g = { group: `outside:plugin:${pl.name}`, origin: 'plugin', originLabel: pl.name };
    for (const p of skillsIn(path.join(pl.dir, 'skills'))) add(p, 'skill', { ...g, client: 'claude', load: 'on-demand', skill: path.basename(path.dirname(p)) });
    for (const p of list(path.join(pl.dir, 'agents'), md)) add(p, 'agent', { ...g, client: 'claude', load: 'on-demand' });
    const pv = { CLAUDE_PLUGIN_ROOT: pl.dir };
    for (const f of [path.join(pl.dir, 'hooks', 'hooks.json'), path.join(pl.dir, '.claude-plugin', 'plugin.json')]) {
      for (const h of hookEntries(readJson(f), pv, pl.name, project)) hooks.push({ ...h, group: g.group, originLabel: pl.name });
    }
  }

  // Hook scripts named by settings become hook nodes in the group that named them.
  for (const h of hooks) {
    if (!h.script) continue;
    const extra = h.group ? { group: h.group, origin: h.group.startsWith('outside:plugin:') ? 'plugin' : 'global', originLabel: h.originLabel ?? null } : {};
    add(h.script, 'hook', { ...extra, client: 'claude', load: 'hook' });
    // A script that is not on disk has no node; leave the hook unmatched rather than point at nothing.
    if (files.has(normPath(h.script))) h.nodeId = normPath(h.script);
  }

  return { files: [...files.values()], hooks, indexId: normPath(indexPath) };
}
