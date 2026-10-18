import { h, api } from './dom.js';
import { compact, exact } from './format.js';
import { visibleGraph, LAYOUTS } from './graph-layout.js';

const NS = 'http://www.w3.org/2000/svg';
const RADIUS = { client: 7, entry: 10, rule: 5, 'cursor-rule': 5, hook: 7, index: 9, hub: 7, memory: 4, playbook: 5, skill: 5, agent: 5, doc: 4 };
const FILL = { 'cursor-rule': 'rule', agent: 'skill', doc: 'playbook' }; // types sharing a colour token
const TYPES = ['entry', 'rule', 'cursor-rule', 'hook', 'index', 'hub', 'memory', 'playbook', 'skill', 'agent', 'doc'];
const ORIGINS = ['project', 'universal', 'generated', 'framework', 'global', 'plugin'];
const HOW_LABEL = { startup: 'at startup', hook: 'through a hook', 'on-demand': 'on demand' };

// Kept between renders of the same project: which groups are open, the selection, the camera, the reader.
const state = { project: null, open: new Set(), selected: null, view: null, reading: null };

function svg(tag, attrs = {}, ...children) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fillOf = type => `var(--n-${FILL[type] || type})`;

function edgePath(a, b, route) {
  const mx = (a.x + b.x) / 2;
  return route === 'ortho'
    ? `M${a.x} ${a.y} H${mx} V${b.y} H${b.x}`
    : `M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
}

function nodeShape(n, shape) {
  const r = RADIUS[n.type] || 5;
  const attrs = { class: `shape${n.missing ? ' missing' : ''}${n.origin ? ` origin-${n.origin}` : ''}`, style: n.missing ? null : `fill:${fillOf(n.type)}` };
  if (shape === 'square') return svg('rect', { ...attrs, x: -r, y: -r, width: 2 * r, height: 2 * r });
  if (shape === 'diamond') return svg('rect', { ...attrs, x: -r * 0.8, y: -r * 0.8, width: r * 1.6, height: r * 1.6, transform: 'rotate(45)' });
  return svg('circle', { ...attrs, r });
}

export async function renderGraph(main, q) {
  const params = new URLSearchParams();
  for (const k of ['from', 'to', 'session']) if (q.get(k)) params.set(k, q.get(k));
  const [data, settings] = await Promise.all([api('/api/graph?' + params), api('/api/settings')]);
  if (!data.project) {
    main.replaceChildren(h('p', {}, 'No project set. ', h('a', { href: '#/settings' }, 'Add one in Settings.')));
    return;
  }
  if (state.project !== data.project) Object.assign(state, { project: data.project, open: new Set(), selected: null, view: null, reading: null });

  const layout = LAYOUTS[q.get('layout')] ? q.get('layout') : settings.layout;
  const byId = new Map(data.nodes.map(n => [n.id, n]));
  const groupById = new Map(data.groups.map(g => [g.id, g]));
  const typeFilter = q.get('type') || '';
  const originFilter = q.get('origin') || '';
  const hidden = n => n.type !== 'client' && ((typeFilter && n.type !== typeFilter) || (originFilter && n.origin !== originFilter));

  // Session overlay: what the picked session touched; the groups holding those files open.
  const touched = new Map();
  for (const o of data.overlay || []) touched.set(o.id, [...(touched.get(o.id) || []), o]);
  for (const id of touched.keys()) { const g = byId.get(id)?.group; if (g) state.open.add(g); }

  const setQuery = changes => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    location.hash = '#/graph?' + next;
  };

  const canvas = h('div', { class: 'graph-canvas' });
  const panel = h('aside', { class: 'panel graph-panel' });
  const reader = h('div', { class: 'reader', hidden: true });
  let pos = {};

  function focus(id) {
    const n = byId.get(id);
    if (!n) return;
    if (n.group) state.open.add(n.group);
    state.selected = id;
    draw();
    const p = pos[id];
    if (p) { state.view = { x: p.x - 450, y: p.y - 280, w: 900, h: 560 }; draw(); }
  }

  function draw() {
    const vis = visibleGraph(data, state.open, hidden);
    pos = LAYOUTS[layout](vis);
    const shape = token('--node-shape') || 'circle';
    const route = token('--edge-route') || 'curve';

    const sel = state.selected;
    const near = new Set(sel ? [sel] : []);
    for (const e of vis.edges) if (e.from === sel || e.to === sel) { near.add(e.from); near.add(e.to); }
    const touchedGroups = new Set([...touched.keys()].map(id => byId.get(id)?.group).filter(Boolean));
    const lit = id => (sel ? near.has(id) : !touched.size || touched.has(id) || id.startsWith('client:') || touchedGroups.has(id));

    const xs = Object.values(pos).map(p => p.x), ys = Object.values(pos).map(p => p.y);
    if (!state.view) {
      const minX = Math.min(...xs) - 140, minY = Math.min(...ys) - 40;
      state.view = { x: minX, y: minY, w: Math.max(...xs) - minX + 260, h: Math.max(...ys) - minY + 60 };
    }
    const v = state.view;
    const root = svg('svg', { class: `graph${touched.size ? ' overlay' : ''}`, viewBox: `${v.x} ${v.y} ${v.w} ${v.h}` });

    const edgeLayer = svg('g');
    for (const e of vis.edges) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      const on = sel ? e.from === sel || e.to === sel : lit(e.from) && lit(e.to);
      edgeLayer.append(svg('path', { class: `edge ${e.kind} ${e.strength}${on ? '' : ' dim'}`, d: edgePath(a, b, route) },
        svg('title', {}, `${e.kind} ${e.how} ${e.strength}${e.count > 1 ? ` ×${e.count}` : ''}`)));
    }
    root.append(edgeLayer);

    for (const item of vis.items) {
      const p = pos[item.id];
      if (!p) continue;
      if (item.kind === 'group') {
        const g = item.group;
        const toggle = () => { item.open ? state.open.delete(g.id) : state.open.add(g.id); draw(); };
        root.append(item.open
          ? svg('g', { class: 'group open', transform: `translate(${p.x},${p.y})`, onclick: toggle },
            svg('text', { x: 0, y: 4 }, `${g.label} (close)`))
          : svg('g', { class: `group${lit(g.id) ? '' : ' dim'}`, transform: `translate(${p.x},${p.y})`, onclick: toggle },
            svg('rect', { x: -6, y: -15, width: 170, height: 30 }),
            svg('text', { x: 2, y: -2 }, g.label.length > 30 ? g.label.slice(0, 29) + '…' : g.label),
            svg('text', { x: 2, y: 10, class: 'sub' }, `${g.fileCount} files · ~${compact(g.estTokens)} tokens`),
            svg('title', {}, g.title || g.label)));
        continue;
      }
      const n = item.node;
      const hits = touched.get(n.id);
      const label = hits ? `${n.label} · ${hits.map(t => `${t.how} ${t.count}`).join(', ')}` : n.label;
      root.append(svg('g', {
        class: `node${n.id === sel ? ' sel' : ''}${lit(n.id) ? '' : ' dim'}`, transform: `translate(${p.x},${p.y})`,
        onclick: ev => { ev.stopPropagation(); state.selected = n.id; draw(); },
      }, nodeShape(n, shape), svg('text', { x: n.type === 'client' ? -12 : (RADIUS[n.type] || 5) + 4, y: 4, 'text-anchor': n.type === 'client' ? 'end' : 'start' }, label),
      svg('title', {}, n.path || n.label)));
    }
    panZoom(root);
    canvas.replaceChildren(root);
    renderPanel();
  }

  function panZoom(root) {
    let drag = null;
    root.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y }; });
    root.addEventListener('mousemove', e => {
      if (!drag) return;
      const k = state.view.w / root.clientWidth;
      state.view.x = drag.vx - (e.clientX - drag.x) * k;
      state.view.y = drag.vy - (e.clientY - drag.y) * k;
      root.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
    });
    root.addEventListener('mouseup', () => { drag = null; });
    root.addEventListener('mouseleave', () => { drag = null; });
    root.addEventListener('wheel', e => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const r = root.getBoundingClientRect();
      const px = state.view.x + ((e.clientX - r.left) / r.width) * state.view.w;
      const py = state.view.y + ((e.clientY - r.top) / r.height) * state.view.h;
      Object.assign(state.view, { x: px - (px - state.view.x) * f, y: py - (py - state.view.y) * f, w: state.view.w * f, h: state.view.h * f });
      root.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
    }, { passive: false });
  }

  const link = id => h('li', {}, h('a', { href: 'javascript:void 0', onclick: () => focus(id) }, byId.get(id)?.label || id),
    h('span', { class: 'tag' }, byId.get(id)?.type || ''));

  function renderPanel() {
    const n = byId.get(state.selected);
    if (!n) {
      panel.replaceChildren(h('h2', {}, 'Legend'),
        h('ul', { class: 'list' }, TYPES.map(t => h('li', {}, h('span', {}, h('i', { class: 'swatch', style: `background:${fillOf(t)}` }), t)))),
        h('p', { class: 'note' }, 'Solid line: a client loads the file. Dotted line: one file names another. Thick: seen in the logs. Dashed accent: named in a command.'),
        h('p', { class: 'note' }, 'File border: none for project files, dashed for universal (edit in the shared repo), dotted for generated, thick for framework (edit in the package).'),
        h('p', { class: 'note' }, 'Click a box to open it. Click a file to see its links.'));
      return;
    }
    const out = data.edges.filter(e => e.kind === 'mention' && e.from === n.id).map(e => e.to);
    const into = data.edges.filter(e => e.kind === 'mention' && e.to === n.id).map(e => e.from);
    const loads = Object.entries(n.clients);
    const u = data.usage[n.id];
    const hits = touched.get(n.id) || [];
    const children = n.type === 'client'
      ? [h('h2', {}, n.label), n.missing ? h('p', { class: 'note' }, 'No startup file for this client in this project.') : null,
        h('ul', { class: 'list' }, ['startup', 'hook', 'on-demand'].map(how =>
          h('li', {}, h('span', {}, `Loads ${HOW_LABEL[how]}`), h('span', { class: 'num' }, data.edges.filter(e => e.kind === 'load' && e.from === n.id && e.how === how && e.strength === 'config').length))))]
      : [
        h('h2', {}, n.label),
        h('p', { class: 'meta' }, n.title),
        h('p', { class: 'path' }, n.path),
        h('p', {}, h('span', { class: 'tag' }, n.type), ' ', h('span', { class: 'tag' }, n.originLabel ? `${n.origin}: ${n.originLabel}` : n.origin)),
        h('p', { class: 'meta', title: `${exact(n.chars)} chars` }, `${exact(n.chars)} chars · ~${compact(n.estTokens)} tokens estimate`),
        h('h3', {}, 'Loaded by'),
        loads.length ? h('ul', { class: 'list' }, loads.map(([c, how]) => h('li', {}, h('span', {}, c), h('span', {}, HOW_LABEL[how]))))
          : h('p', { class: 'note' }, 'No client loads it directly; reached through links.'),
        h('h3', {}, 'In sessions (date range)'),
        u ? h('ul', { class: 'list' },
          h('li', {}, h('span', {}, 'Sessions'), h('span', { class: 'num' }, u.sessions)),
          h('li', {}, h('span', {}, 'Loaded or read (seen in log)'), h('span', { class: 'num' }, u.observed)),
          h('li', {}, h('span', {}, 'Named in a command'), h('span', { class: 'num' }, u.named)),
          h('li', {}, h('span', {}, 'Tokens, estimate'), h('span', { class: 'num' }, n.type === 'hook' ? 'see hook injections' : `~${compact(u.estTokens)}`)),
          h('li', {}, h('span', {}, 'Last seen'), h('span', {}, u.lastSeen ? new Date(u.lastSeen).toLocaleString('en-GB') : '–')))
          : h('p', { class: 'note' }, 'No session touched it in this range.'),
        hits.length ? h('p', { class: 'hot' }, `This session: ${hits.map(t => `${t.how} ×${t.count} (${t.strength})`).join(', ')}`) : null,
        h('h3', {}, `Mentions (${out.length})`), h('ul', { class: 'list links' }, out.map(link)),
        h('h3', {}, `Mentioned by (${into.length})`), h('ul', { class: 'list links' }, into.map(link)),
        h('button', { onclick: () => openReader(n.id) }, 'Read'),
      ];
    panel.replaceChildren(...children.filter(Boolean));
  }

  async function openReader(id) {
    const f = await api('/api/file?id=' + encodeURIComponent(id));
    const keys = Object.keys(f.refs).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const parts = keys.length ? f.text.split(new RegExp(`(${keys.join('|')})`, 'g')) : [f.text];
    const close = () => { reader.hidden = true; state.reading = null; };
    reader.replaceChildren(
      h('div', { class: 'reader-head' }, h('button', { onclick: close }, 'Back to map'), h('span', { class: 'path' }, f.path)),
      h('pre', {}, parts.map(part => (f.refs[part]
        ? h('a', { href: 'javascript:void 0', onclick: () => { close(); focus(f.refs[part]); } }, part)
        : part))));
    reader.hidden = false;
    state.reading = id;
  }

  const counts = {};
  for (const n of data.nodes) if (n.type !== 'client') counts[n.type] = (counts[n.type] || 0) + 1;
  const search = h('input', { type: 'search', placeholder: 'Find a file', list: 'graph-files' });
  const find = () => {
    const s = search.value.trim().toLowerCase();
    const hit = s ? (data.nodes.find(n => n.label.toLowerCase() === s)
      || data.nodes.find(n => n.label.toLowerCase().includes(s) || (n.path || '').toLowerCase().includes(s))) : null;
    if (hit) focus(hit.id);
  };
  search.addEventListener('keydown', e => { if (e.key === 'Enter') find(); });
  const select = (key, options, label) => h('label', {}, label, h('select', { onchange: e => setQuery({ [key]: e.target.value }) },
    options.map(([value, text]) => h('option', { value, selected: (q.get(key) || '') === value }, text))));

  main.replaceChildren(
    h('h1', {}, 'Config graph'),
    h('p', { class: 'meta' }, `${data.project} · ${Object.entries(counts).map(([t, c]) => `${c} ${t}`).join(' · ')}`),
    h('div', { class: 'filters' },
      h('label', {}, 'From', h('input', { type: 'date', value: q.get('from') || '', onchange: e => setQuery({ from: e.target.value }) })),
      h('label', {}, 'To', h('input', { type: 'date', value: q.get('to') || '', onchange: e => setQuery({ to: e.target.value }) })),
      select('session', [['', 'No session'], ...data.sessions.map(s => [`${s.client}/${s.id}`, `${(s.start || '').slice(0, 10)} ${s.client} ${(s.title || s.id).slice(0, 40)}`])], 'Session'),
      select('type', [['', 'All'], ...TYPES.map(t => [t, t])], 'Type'),
      select('origin', [['', 'All'], ...ORIGINS.map(o => [o, o])], 'Origin'),
      h('label', {}, 'Search', search),
      h('datalist', { id: 'graph-files' }, data.nodes.filter(n => n.path).map(n => h('option', { value: n.label }))),
      h('button', { onclick: find }, 'Find'),
      h('button', { onclick: () => { data.groups.forEach(g => state.open.add(g.id)); state.view = null; draw(); } }, 'Open all'),
      h('button', { onclick: () => { state.open.clear(); state.view = null; draw(); } }, 'Close all'),
      h('button', { onclick: () => { state.view = null; draw(); } }, 'Fit')),
    h('div', { class: 'graph-wrap' }, canvas, panel),
    reader);
  draw();
  if (state.reading) openReader(state.reading);
}
