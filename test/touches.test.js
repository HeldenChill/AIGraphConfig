import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { claudeTouches, codexTouches } from '../src/parse/touches.js';
import { parseClaudeSession } from '../src/parse/claude.js';
import { readFixture } from './helpers.js';

const tool = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });
const att = attachment => ({ type: 'attachment', attachment });
const pick = (touches, how) => touches.filter(t => t.how === how).map(t => [t.target, t.event, t.count]);

test('claude touches: startup, hooks, skill, read, write, named; tool ids counted once', () => {
  const main = [
    att({ type: 'instructions', files: [{ path: 'C:\\p\\CLAUDE.md', type: 'Project', content: 'x' }] }),
    att({ type: 'hook_success', hookEvent: 'SessionStart', toolUseID: 'h1', command: 'Loading g' }),
    att({ type: 'hook_additional_context', hookEvent: 'SessionStart', toolUseID: 'h1', content: ['x'] }),
    att({ type: 'hook_additional_context', hookName: 'UserPromptSubmit', hookEvent: 'UserPromptSubmit', toolUseID: 'h2', content: ['y'] }),
    tool('t1', 'Skill', { skill: 'pl:brainstorming' }),
    tool('t2', 'Read', { file_path: 'C:\\p\\a.md' }),
    tool('t3', 'Edit', { file_path: 'C:\\p\\a.md' }),
    tool('t4', 'Bash', { command: 'grep -n x .cursor/memory/mem-a.md mem-b; cat mem-a.md' }),
    tool('t5', 'Grep', { pattern: 'x', path: 'C:/p/.claude/rules/r1.md' }),
  ];
  const sub = [tool('t2', 'Read', { file_path: 'C:\\p\\a.md' }), tool('t6', 'Read', { file_path: 'C:\\p\\a.md' })];
  const t = claudeTouches([main, sub]);
  assert.deepEqual(pick(t, 'startup'), [['C:\\p\\CLAUDE.md', null, 1]]);
  assert.deepEqual(pick(t, 'hook'), [['Loading g', 'SessionStart', 1], [null, 'UserPromptSubmit', 1]], 'context line of a logged run not counted again');
  assert.deepEqual(pick(t, 'skill'), [['pl:brainstorming', null, 1]]);
  assert.deepEqual(pick(t, 'read'), [['C:\\p\\a.md', null, 2]], 't2 in both files counts once, t6 counts');
  assert.deepEqual(pick(t, 'write'), [['C:\\p\\a.md', null, 1]]);
  assert.deepEqual(pick(t, 'named'), [['.cursor/memory/mem-a.md', null, 1], ['mem-b', null, 1], ['mem-a.md', null, 1], ['C:/p/.claude/rules/r1.md', null, 1]]);
});

test('codex touches: AGENTS.md block and named files in commands', () => {
  const rows = [
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '# AGENTS.md instructions for G:\\Proj\n\n<INSTRUCTIONS>' }] } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', input: 'tools.exec_command({cmd:"Get-Content .agents/skills/s1/SKILL.md"})' } },
    { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"cmd":"cat mem-x.md"}' } },
  ];
  const t = codexTouches(rows);
  assert.deepEqual(pick(t, 'startup'), [[path.join('G:\\Proj', 'AGENTS.md'), null, 1]]);
  assert.deepEqual(pick(t, 'named'), [['.agents/skills/s1/SKILL.md', null, 1], ['mem-x.md', null, 1]]);
});

test('parser fills session touches', () => {
  const s = parseClaudeSession(readFixture('claude-session.jsonl'), { id: 's1', file: 'x', project: 'G:\\Proj' });
  assert.deepEqual(pick(s.touches, 'startup').map(x => x[0]), ['C:\\u\\.claude\\CLAUDE.md', 'P\\.claude\\rules\\a.md', 'C:\\u\\memory\\MEMORY.md']);
  assert.deepEqual(pick(s.touches, 'read'), [['a.md', null, 1]]);
});
