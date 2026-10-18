import { normPath } from './classify.js';
import { makeResolver } from './resolve.js';

const LOAD_HOW = { startup: 'startup', hook: 'hook' }; // everything else a session touches is on demand
const RANK = { observed: 0, named: 1 };

// Node ids a session touch points at, with strength observed (log saw it) or named (a command named it).
function targetsOf(t, client, graph, byId, resolve) {
  const one = (id, strength) => (id && byId.has(id) ? [{ id, strength }] : []);
  const fromPath = p => {
    const id = resolve(p, graph.project);
    return id && byId.has(id) ? id : (byId.has(normPath(p)) ? normPath(p) : null);
  };
  switch (t.how) {
    case 'startup': {
      const hits = one(fromPath(t.target), 'observed');
      // Codex sends global and project AGENTS.md in one injected block.
      if (client === 'codex') {
        for (const n of graph.nodes) if (n.group === 'outside:codex-global' && n.type === 'entry') hits.push({ id: n.id, strength: 'observed' });
      }
      return hits;
    }
    case 'read':
    case 'write':
      return one(fromPath(t.target), 'observed');
    case 'skill': {
      const [plugin, name] = t.target.includes(':') ? t.target.split(':', 2) : [null, t.target];
      return graph.nodes
        .filter(n => n.type === 'skill' && n.skill === name && n.clients[client] &&
          (plugin ? n.group === `outside:plugin:${plugin}` : !n.group?.startsWith('outside:plugin:')))
        .map(n => ({ id: n.id, strength: 'observed' }));
    }
    case 'hook': {
      if (t.target) {
        return graph.hooks.filter(h => h.event === t.event && (h.command === t.target || h.statusMessage === t.target))
          .map(h => ({ id: h.nodeId, strength: 'observed' }));
      }
      const same = graph.hooks.filter(h => h.event === t.event);
      return same.map(h => ({ id: h.nodeId, strength: same.length === 1 ? 'observed' : 'named' }));
    }
    case 'named':
      return one(resolve(t.target, graph.project), 'named');
    default:
      return [];
  }
}

// usage: per node over the given sessions; logEdges: client to node, observed or named;
// overlay: what the picked session touched (null when no session is picked).
// sessions: v1 Session objects with touches; pick: "client/id" or null.
export function applyUsage(graph, sessions, pick) {
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const resolve = makeResolver(graph.nodes);
  const usage = {};
  const logEdges = new Map();
  let overlay = null;

  for (const s of sessions) {
    const picked = pick === `${s.client}/${s.id}`;
    if (picked) overlay = [];
    for (const t of s.touches || []) {
      for (const { id, strength } of targetsOf(t, s.client, graph, byId, resolve)) {
        const u = usage[id] ||= { sessions: [], observed: 0, named: 0, estTokens: 0, lastSeen: null };
        if (!u.sessions.includes(s.id)) u.sessions.push(s.id);
        u[strength] += t.count;
        // A hook's script never enters the context; its injected text is counted by v1's hook panel.
        if (strength === 'observed' && byId.get(id).type !== 'hook') u.estTokens += t.count * byId.get(id).estTokens;
        if (s.start && (!u.lastSeen || s.start > u.lastSeen)) u.lastSeen = s.start;

        const how = LOAD_HOW[t.how] || 'on-demand';
        const k = `client:${s.client}|${id}`;
        const e = logEdges.get(k);
        if (!e) logEdges.set(k, { from: `client:${s.client}`, to: id, kind: 'load', how, strength, count: t.count });
        else {
          e.count += t.count;
          if (RANK[strength] < RANK[e.strength]) Object.assign(e, { strength, how });
        }
        if (picked) overlay.push({ id, how: t.how, strength, count: t.count });
      }
    }
  }
  for (const u of Object.values(usage)) u.sessions = u.sessions.length;
  return { usage, logEdges: [...logEdges.values()], overlay };
}
