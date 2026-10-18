import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleGraph, layoutLayers, layoutClusters, ROW, COL, WRAP } from '../public/graph-layout.js';

const n = (id, type, group = null) => ({ id, type, group, label: id });
const graph = {
  nodes: [
    n('client:claude', 'client'), n('entry', 'entry'), n('r1', 'rule'), n('r2', 'rule'), n('hk', 'hook'), n('idx', 'index'),
    n('hubA', 'hub', 'hub:hubA'), n('m1', 'memory', 'hub:hubA'), n('m2', 'memory', 'hub:hubA'),
    n('u1', 'memory', 'unfiled'), n('g1', 'skill', 'outside:plugin:pl'),
  ],
  groups: [
    { id: 'hub:hubA', kind: 'hub', label: 'hubA', fileCount: 3 },
    { id: 'unfiled', kind: 'unfiled', label: 'Unfiled', fileCount: 1 },
    { id: 'outside:plugin:pl', kind: 'outside', label: 'Plugin: pl', fileCount: 1 },
  ],
  edges: [
    { from: 'client:claude', to: 'entry', kind: 'load', how: 'startup', strength: 'config' },
    { from: 'entry', to: 'm1', kind: 'mention', how: 'name', strength: 'config' },
    { from: 'entry', to: 'm2', kind: 'mention', how: 'link', strength: 'config' },
    { from: 'm1', to: 'm2', kind: 'mention', how: 'name', strength: 'config' },
    { from: 'client:claude', to: 'm1', kind: 'load', how: 'on-demand', strength: 'named' },
    { from: 'client:claude', to: 'm2', kind: 'load', how: 'on-demand', strength: 'observed' },
  ],
};

test('closed groups: edges re-pointed, merged, strongest kept, inner edges dropped', () => {
  const v = visibleGraph(graph, new Set());
  assert.deepEqual(v.items.filter(i => i.kind === 'group').map(i => [i.id, i.open]), [['hub:hubA', false], ['unfiled', false], ['outside:plugin:pl', false]]);
  assert.ok(!v.items.some(i => i.id === 'm1'));
  const mention = v.edges.find(e => e.from === 'entry' && e.to === 'hub:hubA');
  assert.deepEqual([mention.kind, mention.count], ['mention', 2]);
  const load = v.edges.find(e => e.from === 'client:claude' && e.to === 'hub:hubA');
  assert.deepEqual([load.strength, load.count], ['observed', 2]);
  assert.ok(!v.edges.some(e => e.from === 'hub:hubA' && e.to === 'hub:hubA'));
});

test('open group shows its files; hidden nodes leave no edges', () => {
  const v = visibleGraph(graph, new Set(['hub:hubA']), x => x.id === 'm2');
  assert.ok(v.items.some(i => i.id === 'm1'));
  assert.ok(!v.items.some(i => i.id === 'm2'));
  assert.ok(!v.edges.some(e => e.to === 'm2' || e.from === 'm2'));
  assert.equal(v.items.find(i => i.id === 'hub:hubA').open, true);
});

test('layers: load order columns, groups after, open files to the right', () => {
  const pos = layoutLayers(visibleGraph(graph, new Set(['hub:hubA'])));
  assert.ok(pos['client:claude'].x < pos.entry.x && pos.entry.x < pos.r1.x && pos.r1.x < pos.hk.x && pos.hk.x < pos.idx.x);
  assert.equal(pos.r2.y - pos.r1.y, ROW);
  assert.ok(pos['outside:plugin:pl'].y < pos['hub:hubA'].y, 'outside boxes first');
  assert.equal(pos.m1.x, pos['hub:hubA'].x + COL);
  assert.ok(pos.unfiled.y > pos.m2.y, 'next group pushed below the open one');
});

test('layers: a long column wraps into sub-columns', () => {
  const many = { nodes: Array.from({ length: WRAP + 1 }, (_, k) => n('r' + String(k).padStart(2, '0'), 'rule')), groups: [], edges: [] };
  const pos = layoutLayers(visibleGraph(many, new Set()));
  assert.equal(pos['r' + WRAP].x, pos.r00.x + COL);
  assert.equal(pos['r' + WRAP].y, 0);
});

test('clusters: every drawn item placed, finite, deterministic', () => {
  const v = visibleGraph(graph, new Set(['hub:hubA', 'outside:plugin:pl']));
  const a = layoutClusters(v);
  assert.deepEqual(a, layoutClusters(v));
  for (const i of v.items) assert.ok(Number.isFinite(a[i.id]?.x) && Number.isFinite(a[i.id]?.y), i.id);
  assert.deepEqual(a.entry, { x: 0, y: 0 });
  assert.ok(a['client:claude'].y < a['hub:hubA'].y);
  assert.ok(a['outside:plugin:pl'].x < Math.min(a.r1.x, a['hub:hubA'].x));
});
