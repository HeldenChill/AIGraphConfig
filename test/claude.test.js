import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeSession } from '../src/parse/claude.js';
import { readFixture } from './helpers.js';

const main = readFixture('claude-session.jsonl');
const sub = readFixture('claude-subagent.jsonl');
const opts = { id: 's1', file: 'f', project: 'P' };
const s = parseClaudeSession(main, opts);

test('dedupes calls by requestId', () => {
  assert.deepEqual(s.prompts.flatMap(p => p.calls.map(c => c.requestId)), ['r0', 'r1', 'r2', 'r3', 'r4']);
});

test('prompt boundaries skip meta and tool_result lines', () => {
  assert.deepEqual(s.prompts.map(p => p.text), ['(before first prompt)', 'first prompt', 'second prompt']);
  assert.deepEqual(s.prompts.map(p => p.calls.length), [1, 2, 2]);
  assert.deepEqual(s.prompts.map(p => p.index), [0, 1, 2]);
});

test('logs without origin fall back to content shape', () => {
  const old = parseClaudeSession(main.replaceAll('"origin":{"kind":"human"},', ''), opts);
  assert.deepEqual(old.prompts.map(p => p.text), ['(before first prompt)', 'first prompt', 'second prompt']);
});

test('cache write split; missing split counts as 5m', () => {
  const [r1, r2] = s.prompts[1].calls;
  assert.equal(r1.cacheWrite1h, 1000);
  assert.equal(r1.cacheWrite5m, 0);
  assert.equal(r1.thinking, 8);
  assert.equal(r2.cacheWrite5m, 50);
  assert.equal(r2.cacheRead, 1000);
});

test('sidechain call is marked subagent and counts in its prompt', () => {
  assert.equal(s.prompts[2].calls[0].subagent, true);
  assert.equal(s.prompts[2].totals.cacheRead, 2100);
});

test('bad lines skipped and counted; synthetic is not a call', () => {
  assert.equal(s.badLines, 1);
  assert.equal(s.title, 'Fixture session');
  assert.equal(s.model, 'claude-test-1');
  assert.equal(s.start, '2026-10-18T09:58:00Z');
  assert.equal(s.end, '2026-10-18T10:06:00Z');
});

test('session totals sum all calls', () => {
  assert.equal(s.totals.fresh, 26);
  assert.equal(s.totals.output, 31);
  assert.equal(s.totals.cacheRead, 3100);
});

test('hook injections: SessionStart joins the first prompt, then hookName before hookEvent', () => {
  assert.deepEqual(s.prompts[0].hookInjections, [{ hook: 'SessionStart', chars: 1, estTokens: 1 }]);
  assert.deepEqual(s.prompts[1].hookInjections, [{ hook: 'UserPromptSubmit', chars: 8, estTokens: 2 }]);
});

test('added lists the previous call tool_use with result size', () => {
  assert.deepEqual(s.prompts[1].calls[0].added, []);
  assert.deepEqual(s.prompts[1].calls[1].added, [{ tool: 'Read', target: 'a.md', chars: 40 }]);
});

test('subagent file calls dedupe against main and attach by time', () => {
  const t = parseClaudeSession(main, { ...opts, extraTexts: [sub] });
  assert.deepEqual(t.prompts[2].calls.map(c => c.requestId).sort(), ['r3', 'r4', 'r5']);
  assert.equal(t.prompts[2].calls.find(c => c.requestId === 'r5').subagent, true);
});

test('empty text gives an empty session, not a crash', () => {
  const e = parseClaudeSession('', opts);
  assert.equal(e.prompts.length, 0);
  assert.equal(e.setupPieces, null);
  assert.equal(e.totals.fresh, 0);
});

test('usage that grows across lines of one call keeps the largest, main and subagent files', () => {
  const line = (id, out, sidechain) => JSON.stringify({
    type: 'assistant', requestId: id, isSidechain: sidechain, timestamp: '2026-10-18T10:05:20Z',
    message: { model: 'claude-test-1', content: [], usage: { input_tokens: 1, output_tokens: out, output_tokens_details: { thinking_tokens: out - 1 } } },
  });
  const t = parseClaudeSession(main + [line('r9', 2, false), line('r9', 30, false)].join('\n'), { ...opts, extraTexts: [[line('r8', 1, true), line('r8', 9, true)].join('\n')] });
  const calls = t.prompts[2].calls;
  assert.equal(calls.find(c => c.requestId === 'r9').output, 30);
  assert.equal(calls.find(c => c.requestId === 'r8').output, 9);
  assert.equal(calls.find(c => c.requestId === 'r8').thinking, 8);
});
