import path from 'node:path';
import { normPath, NAME_TOKEN } from './classify.js';

// The one matcher from a written name or path to a node id. Returns null when unknown or ambiguous.
export function makeResolver(nodes) {
  const ids = new Set();
  const byName = new Map(); // lower basename -> ids
  for (const n of nodes) {
    if (!n.path) continue;
    ids.add(n.id);
    const k = path.basename(n.path).toLowerCase();
    byName.set(k, [...(byName.get(k) || []), n.id]);
  }
  const idList = [...ids];

  return function resolve(token, fromDir) {
    let t = token.replace(/\\/g, '/').replace(/^~\//, '').replace(/^\.\//, '');
    try { t = decodeURIComponent(t); } catch { /* keep as written */ }
    t = t.replace(/^\/([a-z])\//i, '$1:/'); // Git Bash /g/x -> g:/x
    if (!/\.(md|mdc|js)$/i.test(t)) {
      if (/^mem-[\w-]+$/i.test(t)) t += '.md';
      else return null;
    }
    if (t.includes('/')) {
      if (/^[a-z]:\//i.test(t)) return ids.has(normPath(t)) ? normPath(t) : null;
      if (fromDir) {
        const id = normPath(path.join(fromDir, t));
        if (ids.has(id)) return id;
      }
      const tail = '/' + t.toLowerCase().replace(/^(\.\.\/)+/, '').replace(/^\//, '');
      const hits = idList.filter(id => id.endsWith(tail));
      return hits.length === 1 ? hits[0] : null;
    }
    const hits = byName.get(t.toLowerCase()) || [];
    return hits.length === 1 ? hits[0] : null;
  };
}

const RANK = { link: 0, wikilink: 1, name: 2 };

// Mention edges: Markdown link, [[wikilink]], or a node's file name or path written in the text.
// One edge per ordered pair, strongest kind kept; self-links and unknown or ambiguous names dropped.
export function extractMentions(nodes, textOf, resolve) {
  const edges = new Map();
  for (const n of nodes) {
    const text = n.path ? textOf(n.id) : '';
    if (!text) continue;
    const dir = path.dirname(n.path);
    const hit = (raw, how) => {
      const to = resolve(raw, dir);
      if (!to || to === n.id) return;
      const k = `${n.id}|${to}`;
      const e = edges.get(k);
      if (!e || RANK[how] < RANK[e.how]) edges.set(k, { from: n.id, to, kind: 'mention', how, strength: 'config' });
    };
    for (const m of text.matchAll(/\]\(<?([^)\s>]+?)>?(?:#[^)]*)?\)/g)) hit(m[1], 'link');
    for (const m of text.matchAll(/\[\[([^\]|#]+)/g)) hit(/\.\w+$/.test(m[1]) ? m[1] : m[1] + '.md', 'wikilink');
    for (const m of text.matchAll(NAME_TOKEN)) hit(m[0], 'name');
  }
  return [...edges.values()];
}
