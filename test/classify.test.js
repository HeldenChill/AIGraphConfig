import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { parentOf, scriptOf, namedIn, hubRows, alwaysApply, frameworkOrigin } from '../src/graph/classify.js';

test('classify helpers', () => {
  assert.equal(parentOf('# T\n**Parent:** `mem-layer5-main` (co-owned)\n'), 'mem-layer5-main');
  assert.equal(parentOf('**Parent:** `mem-arch.md` — this is a method'), 'mem-arch');
  assert.equal(parentOf('no parent'), null);
  assert.deepEqual(hubRows('| HUB: Bugs - records | `bugs/README.md` |\n| plain | `mem-x.md` |'), [{ label: 'Bugs - records', file: 'bugs/README.md' }]);
  assert.equal(alwaysApply('---\ndescription: x\nalwaysApply: true\n---\nbody'), true);
  assert.equal(alwaysApply('alwaysApply: true'), false);
  assert.equal(frameworkOrigin('<!-- GENERATED from com.hung.autotest@0.4.4 — edit -->\n'), 'com.hung.autotest@0.4.4');
  assert.equal(scriptOf('node "$CLAUDE_PROJECT_DIR/.claude/hooks/a.js"', { CLAUDE_PROJECT_DIR: 'C:/p' }), path.resolve('C:/p/.claude/hooks/a.js'));
  assert.equal(scriptOf('"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-start', { CLAUDE_PLUGIN_ROOT: 'C:/pl' }), path.resolve('C:/pl/hooks/run-hook.cmd'));
  assert.equal(scriptOf('C:/x/claude-hook.cmd || echo {}'), path.resolve('C:/x/claude-hook.cmd'));
  assert.equal(scriptOf('"${UNKNOWN}/a.js"'), null);
  assert.equal(scriptOf('echo hi'), null);
  assert.equal(scriptOf('node .claude/hooks/a.js', {}, 'C:/p'), path.resolve('C:/p/.claude/hooks/a.js'));
  assert.equal(scriptOf('bash ~/hooks/a.sh', {}, 'C:/p'), path.join(os.homedir(), 'hooks', 'a.sh'));
  assert.deepEqual(namedIn('cat .cursor/memory/mem-a.md; grep -l mem-b-c x; node G:\\p\\h.js'),
    ['.cursor/memory/mem-a.md', 'mem-b-c', 'G:\\p\\h.js']);
});
