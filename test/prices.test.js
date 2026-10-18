import test from 'node:test';
import assert from 'node:assert/strict';
import { findPrice, callCost, priceSession } from '../src/prices.js';
import { emptyTotals } from '../src/model.js';

const P = { models: { 'claude-x-1': { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 } } };

function sessionWithModels(models) {
  const calls = models.map((model, i) => ({ ...emptyTotals(), requestId: 'r' + i, model, fresh: 1e6, cost: null }));
  return { prompts: [{ calls, cost: null }], cost: null, unpriced: [] };
}

test('cost per field; thinking not billed twice', () => {
  const c = { fresh: 1e6, output: 1e6, thinking: 5e5, cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6 };
  assert.ok(Math.abs(callCost(c, P.models['claude-x-1']) - 28.05) < 1e-9);
});

test('date-suffixed id uses the base row; a newer version never falls back', () => {
  assert.equal(findPrice('claude-x-1-20260101', P), P.models['claude-x-1']);
  assert.equal(findPrice('claude-x-1-5', P), null);
  assert.equal(findPrice('claude-y', P), null);
});

test('unknown model: cost null and listed, never zero', () => {
  const s = priceSession(sessionWithModels(['claude-x-1', 'mystery']), P);
  assert.equal(s.prompts[0].calls[1].cost, null);
  assert.deepEqual(s.unpriced, ['mystery']);
  assert.equal(s.cost, 3);
});

test('all calls unpriced: cost null', () => {
  assert.equal(priceSession(sessionWithModels(['mystery']), P).cost, null);
});

test('priceSession does not mutate its input', () => {
  const s = sessionWithModels(['claude-x-1']);
  priceSession(s, P);
  assert.equal(s.prompts[0].calls[0].cost, null);
});
