import { compact, exact, money } from './format.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, style = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  Object.assign(e.style, style); // fill as style so CSS variables work
  return e;
}

function tip(node, text) {
  const t = el('title');
  t.textContent = text;
  node.append(t);
  return node;
}

// segments: [{ label, value, color }] where color is a CSS value such as 'var(--s-fresh)'
export function stackedBar(segments, height = 14) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1;
  const svg = el('svg', { class: 'chart', viewBox: `0 0 1000 ${height}`, preserveAspectRatio: 'none', height });
  let x = 0;
  for (const s of segments) {
    const w = (s.value / total) * 1000;
    svg.append(tip(el('rect', { x, y: 0, width: w, height }, { fill: s.color }), `${s.label}: ${exact(s.value)}`));
    x += w;
  }
  return svg;
}

// One bar per prompt; height = cost, or tokens when the cost is unknown.
export function promptTimeline(prompts, onPick, height = 80) {
  const n = Math.max(prompts.length, 1);
  const tokens = p => p.totals.fresh + p.totals.cacheWrite5m + p.totals.cacheWrite1h + p.totals.cacheRead + p.totals.output;
  const value = p => p.cost ?? tokens(p);
  const max = Math.max(...prompts.map(value), 1e-12);
  const slot = 1000 / n;
  const svg = el('svg', { class: 'chart', viewBox: `0 0 1000 ${height}`, preserveAspectRatio: 'none', height });
  prompts.forEach((p, i) => {
    const h = Math.max(1, (value(p) / max) * height);
    const bar = el('rect', { x: i * slot + slot * 0.1, y: height - h, width: slot * 0.8, height: h }, { fill: 'var(--accent)', cursor: 'pointer' });
    bar.addEventListener('click', () => onPick(p.index));
    svg.append(tip(bar, `Prompt ${p.index}: ${p.cost === null ? compact(tokens(p)) + ' tokens' : money(p.cost)}`));
  });
  return svg;
}
