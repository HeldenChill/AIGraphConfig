import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../src/graph/build.js';
import { applyUsage } from '../src/graph/usage.js';
import { normPath } from '../src/graph/classify.js';
import { fakeConfig } from './helpers.js';

const f = fakeConfig();
const g = buildGraph({ ...f, showDocs: false });
const id = (...parts) => normPath(path.join(f.project, ...parts));
const session = (sid, client, touches, start = '2026-10-18T10:00:00Z') => ({ id: sid, client, start, touches });

test('usage maps touches to nodes with strength', () => {
  const t = (how, target, count = 1, event = null) => ({ how, target, event, count });
  const s1 = session('s1', 'claude', [
    t('startup', path.join(f.project, 'CLAUDE.MD')),                      // case differs
    t('read', path.join(f.project, '.cursor', 'memory', 'mem-beta.md'), 2),
    t('skill', 'pl:brainstorming'),
    t('skill', 's1'),
    t('hook', 'Loading g', 1, 'SessionStart'),                               // statusMessage match
    t('hook', null, 3, 'UserPromptSubmit'),                                  // one script serves the event
    t('hook', null, 1, 'SessionStart'),                                      // two scripts: named
    t('named', '/' + f.project[0].toLowerCase() + f.project.slice(2).replace(/\\/g, '/') + '/.cursor/memory/mem-gamma.md'),
    t('read', 'C:\\elsewhere\\nope.md'),
  ]);
  const s2 = session('s2', 'codex', [t('startup', path.join(f.project, 'AGENTS.md'))], '2026-10-17T10:00:00Z');
  const { usage, logEdges, overlay } = applyUsage(g, [s1, s2], 'codex/s2');

  assert.deepEqual(usage[id('CLAUDE.md')], { sessions: 1, observed: 1, named: 0, estTokens: g.nodes.find(n => n.id === id('CLAUDE.md')).estTokens, lastSeen: '2026-10-18T10:00:00Z' });
  assert.equal(usage[id('.cursor', 'memory', 'mem-beta.md')].observed, 2);
  assert.equal(usage[g.nodes.find(n => n.skill === 'brainstorming').id].observed, 1);
  assert.equal(usage[id('.claude', 'skills', 's1', 'SKILL.md')].observed, 1, 'plain skill name: project Claude skill');
  assert.equal(usage[id('.agents', 'skills', 's1', 'SKILL.md')], undefined, 'Codex copy not credited for a Claude session');
  const gjs = normPath(path.join(f.claudeHome, 'hooks', 'g.js'));
  assert.deepEqual([usage[gjs].observed, usage[gjs].named, usage[gjs].estTokens], [1, 1, 0], 'hook script size never counted as tokens');
  assert.equal(usage[id('.claude', 'hooks', 'inject.js')].observed, 3);
  assert.equal(usage[id('.cursor', 'memory', 'mem-gamma.md')].named, 1);
  assert.equal(usage[id('AGENTS.md')].observed, 1);
  assert.equal(usage[normPath(path.join(f.codexHome, 'AGENTS.md'))].observed, 1, 'Codex block includes global AGENTS.md');

  const e = logEdges.find(x => x.from === 'client:claude' && x.to === id('.cursor', 'memory', 'mem-beta.md'));
  assert.deepEqual([e.kind, e.how, e.strength, e.count], ['load', 'on-demand', 'observed', 2]);
  assert.equal(logEdges.find(x => x.to === id('.cursor', 'memory', 'mem-gamma.md')).strength, 'named');
  assert.deepEqual(overlay.map(o => [o.id, o.how, o.strength]).sort(),
    [[id('AGENTS.md'), 'startup', 'observed'], [normPath(path.join(f.codexHome, 'AGENTS.md')), 'startup', 'observed']].sort());
  assert.equal(applyUsage(g, [s1], null).overlay, null);
});

test('a hook whose script is missing does not break usage', () => {
  const h = fakeConfig();
  fs.writeFileSync(path.join(h.project, '.claude', 'settings.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [
    { type: 'command', command: 'node .claude/hooks/missing.js' }] }] } }));
  const hg = buildGraph({ ...h, showDocs: false });
  const s = session('s', 'claude', [{ how: 'hook', target: null, event: 'Stop', count: 1 }]);
  assert.doesNotThrow(() => applyUsage(hg, [s], 'claude/s'));
});
