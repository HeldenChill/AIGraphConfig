// Pure layout, no DOM: graph.js draws it and node --test checks it.

export const ROW = 22;      // vertical step between nodes
export const COL = 210;     // column width
export const WRAP = 30;     // nodes per column before it wraps into a sub-column
const RANK = { observed: 0, named: 1, config: 2 };
const COLUMN = { client: 0, entry: 1, rule: 2, 'cursor-rule': 2, hook: 3, agent: 3, skill: 3, index: 4, hub: 4, memory: 4, playbook: 4, doc: 4 };
const GROUP_ORDER = { outside: 0, hub: 1, unfiled: 2, playbooks: 3, docs: 4 };

const byLabel = (a, b) => (a.label || '').localeCompare(b.label || '') || a.id.localeCompare(b.id);

// What gets drawn: every group (closed ones as boxes), open nodes; edges re-pointed to the box of a
// closed group, merged per pair and kind with the strongest strength kept.
export function visibleGraph(graph, open, hidden = () => false) {
  const items = graph.groups.map(g => ({ id: g.id, kind: 'group', open: open.has(g.id), group: g, label: g.label }));
  const drawnAs = new Map();
  for (const n of graph.nodes) {
    if (hidden(n)) continue;
    if (n.group && !open.has(n.group)) { drawnAs.set(n.id, n.group); continue; }
    items.push({ id: n.id, kind: 'node', node: n, label: n.label });
    drawnAs.set(n.id, n.id);
  }
  const edges = new Map();
  for (const e of graph.edges) {
    const from = drawnAs.get(e.from), to = drawnAs.get(e.to);
    if (!from || !to || from === to) continue;
    const k = `${from}|${to}|${e.kind}`;
    const x = edges.get(k);
    if (!x) edges.set(k, { from, to, kind: e.kind, how: e.how, strength: e.strength, count: 1 });
    else {
      x.count++;
      if (RANK[e.strength] < RANK[x.strength]) Object.assign(x, { strength: e.strength, how: e.how });
    }
  }
  return { items, edges: [...edges.values()] };
}

function groupsSorted(items) {
  return items.filter(i => i.kind === 'group')
    .sort((a, b) => GROUP_ORDER[a.group.kind] - GROUP_ORDER[b.group.kind] || byLabel(a, b));
}
const membersOf = (items, groupId) => items.filter(i => i.kind === 'node' && i.node.group === groupId).sort(byLabel);

// Layers: columns in load order, then one column of groups; an open group's files fan out to its right.
export function layoutLayers(vis) {
  const pos = {};
  const cols = [[], [], [], [], []];
  for (const i of vis.items) if (i.kind === 'node' && !i.node.group) cols[COLUMN[i.node.type] ?? 4].push(i);
  let x = 0;
  for (const col of cols) {
    col.sort((a, b) => a.node.type.localeCompare(b.node.type) || byLabel(a, b));
    col.forEach((item, k) => { pos[item.id] = { x: x + Math.floor(k / WRAP) * COL, y: (k % WRAP) * ROW }; });
    x += COL * Math.max(1, Math.ceil(col.length / WRAP));
  }
  let y = 0;
  for (const g of groupsSorted(vis.items)) {
    pos[g.id] = { x, y };
    const members = g.open ? membersOf(vis.items, g.id) : [];
    members.forEach((m, k) => { pos[m.id] = { x: x + COL + Math.floor(k / WRAP) * COL, y: y + (k % WRAP) * ROW }; });
    y += Math.max(1, Math.min(members.length, WRAP)) * ROW + ROW;
  }
  return pos;
}

const ring = (n, r, cx = 0, cy = 0, start = -Math.PI / 2) =>
  Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos(start + (2 * Math.PI * k) / n), y: cy + r * Math.sin(start + (2 * Math.PI * k) / n) }));
const ringRadius = (n, min) => Math.max(min, (n * ROW * 1.4) / (2 * Math.PI));

// Clusters: project entry files in the middle, the rest of the skeleton on an inner ring, groups on an
// outer ring with open files circled around them, clients on top, outside sources down the left edge.
// ponytail: big open groups can overlap their ring neighbours; pan and zoom cope, a force pass would fix it
export function layoutClusters(vis) {
  const pos = {};
  const skeleton = vis.items.filter(i => i.kind === 'node' && !i.node.group).sort((a, b) => a.node.type.localeCompare(b.node.type) || byLabel(a, b));
  const centre = skeleton.filter(i => i.node.type === 'entry');
  const clients = skeleton.filter(i => i.node.type === 'client');
  const inner = skeleton.filter(i => i.node.type !== 'entry' && i.node.type !== 'client');
  centre.forEach((item, k) => { pos[item.id] = { x: 0, y: (k - (centre.length - 1) / 2) * ROW }; });

  const r1 = ringRadius(inner.length, 180);
  ring(inner.length, r1).forEach((p, k) => { pos[inner[k].id] = p; });

  const groups = groupsSorted(vis.items);
  const ringGroups = groups.filter(g => g.group.kind !== 'outside');
  const memberR = g => (g.open ? ringRadius(membersOf(vis.items, g.id).length, 60) : 0);
  const r2 = r1 + 220 + Math.max(0, ...ringGroups.map(memberR));
  ring(ringGroups.length, r2).forEach((p, k) => {
    const g = ringGroups[k];
    pos[g.id] = p;
    const members = g.open ? membersOf(vis.items, g.id) : [];
    ring(members.length, memberR(g), p.x, p.y).forEach((q, j) => { pos[members[j].id] = q; });
  });

  clients.forEach((item, k) => { pos[item.id] = { x: (k - (clients.length - 1) / 2) * COL / 2, y: -r2 - 160 }; });

  let y = -r2;
  const left = -r2 - 2 * COL;
  for (const g of groups.filter(x => x.group.kind === 'outside')) {
    pos[g.id] = { x: left, y };
    const members = g.open ? membersOf(vis.items, g.id) : [];
    members.forEach((m, k) => { pos[m.id] = { x: left - COL + Math.floor(k / WRAP) * -COL, y: y + (k % WRAP) * ROW }; });
    y += Math.max(1, Math.min(members.length, WRAP)) * ROW + 2 * ROW;
  }
  return pos;
}

export const LAYOUTS = { layers: layoutLayers, clusters: layoutClusters };
