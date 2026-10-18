export const FIELDS = ['fresh', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output', 'thinking'];

export function emptyTotals() {
  return Object.fromEntries(FIELDS.map(f => [f, 0]));
}

export function addTotals(a, b) {
  const t = {};
  for (const f of FIELDS) t[f] = (a[f] || 0) + (b[f] || 0);
  return t;
}

export function estTokens(chars) {
  return Math.ceil(chars / 4);
}

// Parse JSONL; a half-written or corrupt line is skipped and counted, never thrown.
export function readJsonl(text) {
  const rows = [];
  let bad = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { bad++; }
  }
  return { rows, bad };
}

export function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}

export function newSession(fields) {
  return {
    id: null, client: null, project: null, file: null, title: null, model: null,
    start: null, end: null, prompts: [], setupPieces: null, firstCallCacheWrite: null,
    rateLimitPercent: null, badLines: 0, totals: null, cost: null, unpriced: [],
    ...fields,
  };
}

export function newPrompt(index, text, start) {
  return { index, text, start, calls: [], hookInjections: [], totals: null, cost: null };
}

// Fill prompt and session totals and the session model from the calls.
export function finishSession(s) {
  for (const p of s.prompts) p.totals = p.calls.reduce(addTotals, emptyTotals());
  s.totals = s.prompts.reduce((t, p) => addTotals(t, p.totals), emptyTotals());
  s.model = mostCommon(s.prompts.flatMap(p => p.calls.map(c => c.model)));
  return s;
}
