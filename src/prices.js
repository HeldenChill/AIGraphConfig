// Exact id, or the id with a date suffix (claude-x-1-20260101 uses claude-x-1).
// Only a date suffix: claude-opus-5-5 must never fall back to claude-opus-5.
export function findPrice(model, prices) {
  const rows = prices.models || {};
  if (!model) return null;
  if (rows[model]) return rows[model];
  const base = model.replace(/-\d{8}$/, '');
  return rows[base] ?? null;
}

// USD. Thinking is already inside output, so it is not billed again.
export function callCost(call, price) {
  return (
    call.fresh * price.input +
    call.cacheWrite5m * price.cacheWrite5m +
    call.cacheWrite1h * price.cacheWrite1h +
    call.cacheRead * price.cacheRead +
    call.output * price.output
  ) / 1e6;
}

// null only when there are costs and every one is unpriced; otherwise the priced sum.
function sumCosts(costs) {
  if (costs.length && costs.every(c => c === null)) return null;
  return costs.reduce((a, c) => a + (c ?? 0), 0);
}

export function priceSession(session, prices) {
  const s = structuredClone(session);
  const unpriced = new Set();
  for (const p of s.prompts) {
    for (const c of p.calls) {
      const price = findPrice(c.model, prices);
      c.cost = price ? callCost(c, price) : null;
      if (!price) unpriced.add(c.model ?? 'unknown');
    }
    p.cost = sumCosts(p.calls.map(c => c.cost));
  }
  s.cost = sumCosts(s.prompts.map(p => p.cost));
  s.unpriced = [...unpriced].sort();
  return s;
}
