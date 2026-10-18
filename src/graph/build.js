import fs from 'node:fs';
import path from 'node:path';
import { estTokens } from '../model.js';
import { normPath, hubRows, parentOf, frameworkOrigin, alwaysApply, titleOf, labelOf } from './classify.js';
import { collectFiles } from './collect.js';
import { makeResolver, extractMentions } from './resolve.js';

export const CLIENTS = [['claude', 'Claude'], ['codex', 'Codex'], ['cursor', 'Cursor'], ['gemini', 'Gemini']];
const FALLBACK_GROUP = { memory: 'unfiled', playbook: 'playbooks', doc: 'docs' };
const GROUP_LABEL = { unfiled: 'Unfiled', playbooks: 'Playbooks', docs: 'Docs', 'outside:claude-global': 'Global Claude', 'outside:codex-global': 'Global Codex' };

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function stampOf(files) {
  return files.map(f => {
    try { const st = fs.statSync(f.path); return `${f.id}:${st.size}:${st.mtimeMs}`; } catch { return f.id; }
  }).join('|');
}

let last = { key: null, graph: null };

// Graph = { project, builtAt, nodes, edges, groups, hooks }. Rebuilt only when a file, the project or showDocs changed.
// ctx = { project, claudeHome, codexHome, sharedDir, showDocs }
export function buildGraph(ctx) {
  const { files, hooks, indexId } = collectFiles(ctx);
  const key = `${ctx.project}|${!!ctx.showDocs}|${stampOf(files)}`;
  if (last.key === key) return last.graph;

  const text = new Map(files.map(f => [f.id, readText(f.path)]));
  const nodes = files.map(f => {
    const t = text.get(f.id);
    const n = {
      id: f.id, path: f.path, type: f.type, origin: f.origin, originLabel: f.originLabel, group: f.group,
      title: titleOf(t, f.path), label: labelOf(f.path), chars: t.length, estTokens: estTokens(t.length),
      clients: {}, skill: f.skill,
    };
    const fw = n.origin === 'project' ? frameworkOrigin(t) : null;
    if (fw) { n.origin = 'framework'; n.originLabel = fw; }
    const load = f.type === 'cursor-rule' ? (alwaysApply(t) ? 'startup' : 'on-demand') : f.load;
    if (f.client && load) n.clients[f.client] = load;
    return n;
  });
  const byId = new Map(nodes.map(n => [n.id, n]));

  // Hubs: files named in HUB: rows, relative to the index folder.
  const indexDir = path.dirname(byId.get(indexId)?.path || indexId);
  const hubLabel = new Map();
  const hubFile = new Map();
  for (const row of hubRows(text.get(indexId) || '')) {
    const id = normPath(path.join(indexDir, row.file));
    if (byId.has(id)) { byId.get(id).type = 'hub'; hubLabel.set(id, row.label); hubFile.set(id, row.file.replace(/\.md$/i, '')); }
  }

  // Membership: own hub, bugs folder, Parent chain up to a hub, else the type's fallback group.
  const byStem = new Map();
  for (const n of nodes) if (!n.group && (n.type === 'memory' || n.type === 'hub')) byStem.set(n.label.toLowerCase(), n.id);
  const bugsHub = normPath(path.join(indexDir, 'bugs', 'README.md'));
  const hubOf = n => {
    if (hubLabel.has(n.id)) return n.id;
    if (hubLabel.has(bugsHub) && n.id.startsWith(path.posix.dirname(bugsHub) + '/')) return bugsHub;
    const seen = new Set();
    let cur = n;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      const parent = parentOf(text.get(cur.id) || '');
      const id = parent && byStem.get(parent.toLowerCase());
      if (!id || id === indexId) return null;
      if (hubLabel.has(id)) return id;
      cur = byId.get(id);
    }
    return null;
  };
  for (const n of nodes) {
    if (n.group || !FALLBACK_GROUP[n.type === 'hub' ? 'memory' : n.type]) continue;
    const hub = hubOf(n);
    n.group = hub ? `hub:${hub}` : FALLBACK_GROUP[n.type === 'hub' ? 'memory' : n.type];
  }

  const groups = new Map();
  for (const n of nodes) {
    if (!n.group) continue;
    const g = groups.get(n.group) || {
      id: n.group,
      kind: n.group.startsWith('hub:') ? 'hub' : n.group.startsWith('outside:') ? 'outside' : n.group,
      label: n.group.startsWith('hub:') ? hubFile.get(n.group.slice(4))
        : n.group.startsWith('outside:plugin:') ? `Plugin: ${n.group.slice(15)}` : GROUP_LABEL[n.group],
      title: hubLabel.get(n.group.slice(4)) ?? null,
      fileCount: 0, estTokens: 0,
    };
    g.fileCount++;
    g.estTokens += n.estTokens;
    groups.set(n.group, g);
  }

  const clients = CLIENTS.map(([c, label]) => ({
    id: `client:${c}`, path: null, type: 'client', label, title: label, origin: null, originLabel: null, group: null,
    chars: 0, estTokens: 0, clients: {}, skill: null,
    missing: !nodes.some(n => n.clients[c] === 'startup'),
  }));

  const loads = nodes.flatMap(n => Object.entries(n.clients).map(([c, how]) =>
    ({ from: `client:${c}`, to: n.id, kind: 'load', how, strength: 'config' })));
  const mentions = extractMentions(nodes, id => text.get(id), makeResolver(nodes));

  const graph = {
    project: ctx.project, builtAt: new Date().toISOString(),
    nodes: [...clients, ...nodes], edges: [...loads, ...mentions], groups: [...groups.values()],
    hooks: hooks.filter(h => h.nodeId).map(({ event, command, statusMessage, nodeId }) => ({ event, command, statusMessage, nodeId })),
  };
  last = { key, graph };
  return graph;
}
