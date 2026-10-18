import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeSlug } from '../src/scan.js';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

export function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'acg-'));
}

// A fake home: Claude and Codex log roots holding copies of the fixtures for project G:\Proj.
export function fakeLogs() {
  const dir = tempDir();
  const claudeRoot = path.join(dir, 'claude');
  const codexRoot = path.join(dir, 'codex');
  const claudeDir = path.join(claudeRoot, 'g--Proj');
  const codexDay = path.join(codexRoot, '2026', '10', '18');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(codexDay, { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 's1.jsonl'), readFixture('claude-session.jsonl'));
  fs.writeFileSync(path.join(codexDay, 'rollout-a.jsonl'), readFixture('codex-rollout.jsonl'));
  fs.writeFileSync(path.join(codexDay, 'rollout-b.jsonl'),
    readFixture('codex-rollout.jsonl').replace('"cwd":"G:\\\\Proj"', '"cwd":"G:\\\\Other"').replace('"id":"cx1"', '"id":"cx2"'));
  return { dir, claudeRoot, codexRoot, claudeDir, cacheFile: path.join(dir, 'cache', 'parsed.json') };
}

// A fake project, shared repo, ~/.claude and ~/.codex for the config graph. Paths are real temp paths.
export function fakeConfig() {
  const dir = tempDir();
  const project = path.join(dir, 'proj');
  const shared = path.join(dir, 'shared');
  const claudeHome = path.join(dir, 'claude-home');
  const codexHome = path.join(dir, 'codex-home');
  const plugin = path.join(dir, 'plugin-pl');
  const put = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const p = (...x) => path.join(project, ...x);

  put(p('CLAUDE.md'), '# Proj\nSee [rule one](.claude/rules/r1.md) and `mem-alpha.md`.\n');
  put(p('AGENTS.md'), '# Agents\n');
  put(p('.claude', 'rules', 'r1.md'), '# R1\nIndex: mem-index.md. Self: r1.md. Skill: SKILL.md\n');
  put(p('.claude', 'rules', 'r2.md'), '<!-- GENERATED from com.hung.autotest@0.4.4 — edit in Package_Repo -->\n# R2\nUnknown: mem-nope.md\n');
  put(p('.claude', 'rules', 'memory-first-workflow.md'), 'MEMORY_MASTER_INDEX  = .cursor/memory/mem-index.md\n');
  put(p('.claude', 'settings.json'), JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [
    { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/inject.js"' }] }] } }));
  put(p('.claude', 'hooks', 'inject.js'), '// prints mem-index.md\n');
  put(p('.claude', 'skills', 's1', 'SKILL.md'), '# s1\n');
  put(p('.agents', 'skills', 's1', 'SKILL.md'), '# s1 codex\n');
  put(p('.claude', 'agents', 'helper.md'), '# helper\n');
  put(p('.cursor', 'rules', 'always.mdc'), '---\nalwaysApply: true\n---\nx\n');
  put(p('.cursor', 'rules', 'maybe.mdc'), '---\nalwaysApply: false\n---\ny\n');
  put(p('.cursor', 'memory', 'mem-index.md'), '| HUB: Alpha hub | `mem-alpha.md` |\n| HUB: Bugs | `bugs/README.md` |\n| Beta | `mem-beta.md` |\n');
  put(p('.cursor', 'memory', 'mem-alpha.md'), '# Alpha\n**Parent:** `mem-index`\nSee [[mem-beta]].\n');
  put(p('.cursor', 'memory', 'mem-beta.md'), '# Beta\n**Parent:** `mem-alpha` — note\n');
  put(p('.cursor', 'memory', 'mem-gamma.md'), '**Parent:** `mem-beta`\n');
  put(p('.cursor', 'memory', 'mem-loop1.md'), '**Parent:** `mem-loop2`\n');
  put(p('.cursor', 'memory', 'mem-loop2.md'), '**Parent:** `mem-loop1`\n');
  put(p('.cursor', 'memory', 'mem-orphan.md'), '**Parent:** `mem-missing`\n');
  put(p('.cursor', 'memory', 'bugs', 'README.md'), '# Bugs\n');
  put(p('.cursor', 'memory', 'bugs', 'mem-bugs-ui.md'), '# UI bugs\n');
  put(p('.cursor', 'playbooks', 'run.md'), '# Run\n');
  put(p('docs', 'guide.md'), '# Guide\n');

  put(path.join(shared, 'manifest.json'), JSON.stringify({
    files: [{ src: 'files/x', bucket: 'universal', dest: ['.claude/rules/memory-first-workflow.md'] }],
    generated: ['.claude/settings.json'],
  }));

  put(path.join(claudeHome, 'CLAUDE.md'), '# Global\n');
  put(path.join(claudeHome, 'hooks', 'g.js'), '// global hook\n');
  put(path.join(claudeHome, 'settings.json'), JSON.stringify({
    enabledPlugins: { 'pl@market': true, 'off@market': false },
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `node "${path.join(claudeHome, 'hooks', 'g.js')}"`, statusMessage: 'Loading g' }] }] },
  }));
  const slugDir = path.join(claudeHome, 'projects', claudeSlug(project));
  put(path.join(slugDir, 'memory', 'MEMORY.md'), '- [Fb](feedback-x.md)\n');
  put(path.join(slugDir, 'memory', 'feedback-x.md'), '# Feedback\n');
  put(path.join(claudeHome, 'skills', 'gs', 'SKILL.md'), '# gs\n');
  put(path.join(claudeHome, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: {
    'pl@market': [{ installPath: plugin }], 'off@market': [{ installPath: path.join(dir, 'nope') }] } }));
  put(path.join(plugin, 'skills', 'brainstorming', 'SKILL.md'), '# brainstorming\n');
  put(path.join(plugin, 'hooks', 'run.cmd'), '@echo off\n');
  put(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [
    { type: 'command', command: '"${CLAUDE_PLUGIN_ROOT}/hooks/run.cmd" start' }] }] } }));

  put(path.join(codexHome, 'AGENTS.md'), '# Global codex\n');

  return { dir, project, claudeHome, codexHome, sharedDir: shared, plugin, slugDir };
}
