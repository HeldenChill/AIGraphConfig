import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../src/graph/build.js';
import { normPath } from '../src/graph/classify.js';
import { makeResolver } from '../src/graph/resolve.js';
import { fakeConfig } from './helpers.js';

const f = fakeConfig();
const g = buildGraph({ ...f, showDocs: false });
const node = (...parts) => g.nodes.find(n => n.id === normPath(path.join(f.project, ...parts)));
const count = type => g.nodes.filter(n => n.type === type).length;
const edge = (from, to, kind) => g.edges.find(e => e.from === from && e.to === to && e.kind === kind);

test('node types and counts', () => {
  assert.equal(count('client'), 4);
  assert.equal(count('entry'), 4); // CLAUDE.md, AGENTS.md, global CLAUDE.md, global codex AGENTS.md
  assert.equal(count('rule'), 3);
  assert.equal(count('cursor-rule'), 2);
  assert.equal(count('hook'), 3); // project inject.js, global g.js, plugin run.cmd
  assert.equal(count('index'), 2); // project index, auto-memory MEMORY.md
  assert.equal(count('hub'), 2);
  assert.equal(count('memory'), 7); // beta, gamma, loop1, loop2, orphan, bugs ui, global feedback-x
  assert.equal(count('playbook'), 1);
  assert.equal(count('skill'), 4); // .claude s1, .agents s1, global gs, plugin brainstorming
  assert.equal(count('agent'), 1);
  assert.equal(count('doc'), 0);
  assert.equal(node('.cursor', 'memory', 'mem-index.md').type, 'index');
});

test('docs only with showDocs', () => {
  const withDocs = buildGraph({ ...f, showDocs: true });
  assert.equal(withDocs.nodes.filter(n => n.type === 'doc').length, 1);
  assert.equal(withDocs.groups.find(x => x.id === 'docs').fileCount, 1);
});

test('origin: manifest, generated header, global, plugin', () => {
  assert.equal(node('.claude', 'rules', 'memory-first-workflow.md').origin, 'universal');
  const r2 = node('.claude', 'rules', 'r2.md');
  assert.deepEqual([r2.origin, r2.originLabel], ['framework', 'com.hung.autotest@0.4.4']);
  assert.equal(node('.claude', 'rules', 'r1.md').origin, 'project');
  const gClaude = g.nodes.find(n => n.id === normPath(path.join(f.claudeHome, 'CLAUDE.md')));
  assert.deepEqual([gClaude.origin, gClaude.group], ['global', 'outside:claude-global']);
  const brain = g.nodes.find(n => n.skill === 'brainstorming');
  assert.deepEqual([brain.origin, brain.originLabel, brain.group], ['plugin', 'pl', 'outside:plugin:pl']);
  assert.ok(!g.groups.some(x => x.id === 'outside:plugin:off'), 'disabled plugin left out');
});

test('hub walk: own hub, Parent chain, loop, missing parent, bugs folder', () => {
  const alpha = `hub:${node('.cursor', 'memory', 'mem-alpha.md').id}`;
  assert.equal(node('.cursor', 'memory', 'mem-alpha.md').group, alpha);
  assert.equal(node('.cursor', 'memory', 'mem-beta.md').group, alpha);
  assert.equal(node('.cursor', 'memory', 'mem-gamma.md').group, alpha);
  assert.equal(node('.cursor', 'memory', 'mem-loop1.md').group, 'unfiled');
  assert.equal(node('.cursor', 'memory', 'mem-orphan.md').group, 'unfiled');
  assert.equal(node('.cursor', 'memory', 'bugs', 'mem-bugs-ui.md').group, `hub:${node('.cursor', 'memory', 'bugs', 'README.md').id}`);
  assert.equal(node('.cursor', 'playbooks', 'run.md').group, 'playbooks');
  const ga = g.groups.find(x => x.id === alpha);
  assert.deepEqual([ga.kind, ga.label, ga.title, ga.fileCount], ['hub', 'mem-alpha', 'Alpha hub', 3]);
  assert.equal(g.groups.find(x => x.kind === 'hub' && x.label === 'bugs/README').fileCount, 2);
});

test('mentions: link, wikilink, name; self, unknown and ambiguous dropped', () => {
  const claudeMd = node('CLAUDE.md').id;
  const r1 = node('.claude', 'rules', 'r1.md').id;
  assert.equal(edge(claudeMd, r1, 'mention').how, 'link');
  assert.equal(edge(claudeMd, node('.cursor', 'memory', 'mem-alpha.md').id, 'mention').how, 'name');
  assert.equal(edge(node('.cursor', 'memory', 'mem-alpha.md').id, node('.cursor', 'memory', 'mem-beta.md').id, 'mention').how, 'wikilink');
  assert.ok(edge(node('.claude', 'hooks', 'inject.js').id, node('.cursor', 'memory', 'mem-index.md').id, 'mention'), 'hook script mentions the index');
  const fromR1 = g.edges.filter(e => e.from === r1 && e.kind === 'mention').map(e => e.to);
  assert.deepEqual(fromR1, [node('.cursor', 'memory', 'mem-index.md').id], 'self and ambiguous SKILL.md dropped');
  assert.equal(g.edges.filter(e => e.from === node('.claude', 'rules', 'r2.md').id && e.kind === 'mention').length, 0, 'unknown dropped');
});

test('config loads per client; Gemini missing; alwaysApply', () => {
  const client = c => g.nodes.find(n => n.id === `client:${c}`);
  assert.equal(client('gemini').missing, true);
  assert.equal(client('cursor').missing, false);
  assert.equal(edge('client:claude', node('.claude', 'rules', 'r1.md').id, 'load').how, 'startup');
  assert.equal(edge('client:codex', node('AGENTS.md').id, 'load').how, 'startup');
  assert.equal(edge('client:cursor', node('.cursor', 'rules', 'always.mdc').id, 'load').how, 'startup');
  assert.equal(edge('client:cursor', node('.cursor', 'rules', 'maybe.mdc').id, 'load').how, 'on-demand');
  assert.equal(edge('client:claude', node('.claude', 'hooks', 'inject.js').id, 'load').how, 'hook');
  assert.equal(edge('client:codex', node('.agents', 'skills', 's1', 'SKILL.md').id, 'load').how, 'on-demand');
  assert.equal(edge('client:claude', normPath(path.join(f.slugDir, 'memory', 'MEMORY.md')), 'load').how, 'startup');
  assert.deepEqual(node('.claude', 'rules', 'r1.md').clients, { claude: 'startup' });
});

test('hook entries from project, global and plugin settings', () => {
  assert.deepEqual(g.hooks.map(h => [h.event, path.basename(h.nodeId)]).sort(),
    [['SessionStart', 'g.js'], ['SessionStart', 'run.cmd'], ['UserPromptSubmit', 'inject.js']]);
  assert.equal(g.hooks.find(h => h.nodeId.endsWith('g.js')).statusMessage, 'Loading g');
  assert.equal(g.nodes.find(n => n.id.endsWith('/run.cmd')).group, 'outside:plugin:pl');
});

test('relative and missing hook scripts, outside index path', () => {
  const h = fakeConfig();
  const put = (file, text) => fs.writeFileSync(path.join(h.project, file), text);
  put('.claude/settings.json', JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [
    { type: 'command', command: 'node .claude/hooks/inject.js' },
    { type: 'command', command: 'node .claude/hooks/missing.js' }] }] } }));
  fs.writeFileSync(path.join(h.dir, 'secret.md'), '# outside\n');
  put('.claude/rules/memory-first-workflow.md', 'MEMORY_MASTER_INDEX  = ../secret.md\n');
  const hg = buildGraph({ ...h, showDocs: false });
  const inject = normPath(path.join(h.project, '.claude', 'hooks', 'inject.js'));
  assert.deepEqual(hg.hooks.filter(x => x.event === 'UserPromptSubmit').map(x => x.nodeId), [inject], 'relative resolves in project; missing has no node');
  assert.ok(!hg.nodes.some(n => n.id.endsWith('/missing.js') || n.id.endsWith('/secret.md')));
});

test('resolver: git bash, relative, suffix and stem forms', () => {
  const resolve = makeResolver(g.nodes);
  const alpha = node('.cursor', 'memory', 'mem-alpha.md').id;
  const gitBash = '/' + f.project[0].toLowerCase() + f.project.slice(2).replace(/\\/g, '/') + '/.cursor/memory/mem-alpha.md';
  assert.equal(resolve(gitBash), alpha);
  assert.equal(resolve('.cursor/memory/mem-alpha.md'), alpha);
  assert.equal(resolve('memory/mem-alpha.md'), alpha);
  assert.equal(resolve('mem-alpha'), alpha);
  assert.equal(resolve('MEM-ALPHA.MD'), alpha);
  assert.equal(resolve('SKILL.md'), null);
  assert.equal(resolve('package.json'), null);
});

test('graph is cached until a file changes', () => {
  assert.equal(buildGraph({ ...f, showDocs: false }), buildGraph({ ...f, showDocs: false }));
});
