import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexRollout } from '../src/parse/codex.js';
import { readFixture } from './helpers.js';

const c = parseCodexRollout(readFixture('codex-rollout.jsonl'), { file: 'f' });

test('fresh = input minus cached; reasoning is thinking', () => {
  assert.equal(c.prompts[0].totals.fresh, 40);
  assert.equal(c.prompts[0].totals.cacheRead, 60);
  assert.equal(c.prompts[0].totals.thinking, 4);
});

test('one call per response_id, grouped by turn', () => {
  assert.deepEqual(c.prompts.map(p => p.calls.length), [1, 2]);
  assert.equal(c.prompts[1].totals.fresh, 60);
  assert.equal(c.prompts[1].totals.output, 25);
});

test('typed text skips AGENTS.md and environment blocks', () => {
  assert.deepEqual(c.prompts.map(p => p.text), ['hello', 'again']);
});

test('meta fields', () => {
  assert.equal(c.id, 'cx1');
  assert.equal(c.client, 'codex');
  assert.equal(c.project, 'G:\\Proj');
  assert.equal(c.prompts[1].calls[0].model, 'gpt-test-2');
  assert.equal(c.model, 'gpt-test-2');
  assert.equal(c.rateLimitPercent, 12.5);
  assert.equal(c.setupPieces, null);
  assert.equal(c.title, 'hello');
});
