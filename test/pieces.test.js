import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaudeSession } from '../src/parse/claude.js';
import { wholeChars } from '../src/pieces.js';
import { readFixture } from './helpers.js';

const s = parseClaudeSession(readFixture('claude-session.jsonl'), { id: 's1', file: 'f', project: 'P' });

test('pieces are named by kind in a fixed order', () => {
  assert.deepEqual(s.setupPieces.map(p => p.kind), ['base', 'claude-md', 'rule', 'memory-index', 'skills', 'mcp', 'tools']);
  assert.equal(s.setupPieces.find(p => p.kind === 'rule').name, 'P\\.claude\\rules\\a.md');
  assert.deepEqual(s.setupPieces.map(p => p.chars), [4, 2, 3, 4, 6, 3, 17]);
});

test('pieces sum to the whole input', () => {
  const input = {
    system: ['BASE'],
    tools: [{ name: 'Read' }],
    attachments: [
      { type: 'instructions', files: [{ path: 'x', content: 'GG' }, { path: 'y', content: 'RRR' }, { path: 'z', content: 'MMMM' }] },
      { type: 'skill_listing', content: 'SKILLS' },
      { type: 'mcp_instructions_delta', addedBlocks: ['MCP'] },
    ],
  };
  assert.equal(s.setupPieces.reduce((n, p) => n + p.chars, 0), wholeChars(input));
});

test('first call cache write is the first nonzero write', () => {
  assert.equal(s.firstCallCacheWrite, 1000);
});
