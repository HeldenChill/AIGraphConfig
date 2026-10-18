import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { claudeSlug, findClaudeDirs, scanProject } from '../src/scan.js';
import { sanitizeSettings, saveSettings, loadSettings } from '../src/settings.js';
import { fakeLogs } from './helpers.js';

test('slug', () => {
  assert.equal(claudeSlug('G:\\Unity\\Project\\PetVsMonster'), 'G--Unity-Project-PetVsMonster');
  assert.equal(claudeSlug('G:\\Projects\\AI Config.Graph\\'), 'G--Projects-AI-Config-Graph');
});

test('slug folder found regardless of case', () => {
  const f = fakeLogs();
  assert.equal(findClaudeDirs('G:\\Proj', f.claudeRoot).length, 1);
  assert.equal(findClaudeDirs('G:\\Nope', f.claudeRoot).length, 0);
});

test('codex rollouts filtered by cwd, case and slash insensitive', () => {
  const f = fakeLogs();
  const sessions = scanProject('g:/proj', f);
  assert.deepEqual(sessions.map(s => s.client + ':' + s.id).sort(), ['claude:s1', 'codex:cx1']);
});

test('missing log roots give no sessions, no throw', () => {
  const f = fakeLogs();
  assert.deepEqual(scanProject('G:\\Proj', { ...f, claudeRoot: path.join(f.dir, 'x'), codexRoot: path.join(f.dir, 'y') }), []);
});

test('unchanged file served from cache, changed file reparsed', () => {
  const f = fakeLogs();
  let parsed = 0;
  const o = { ...f, onParse: () => parsed++ };
  scanProject('G:\\Proj', o);
  parsed = 0;
  scanProject('G:\\Proj', o);
  assert.equal(parsed, 0);
  fs.appendFileSync(path.join(f.claudeDir, 's1.jsonl'), '\n');
  scanProject('G:\\Proj', o);
  assert.equal(parsed, 1);
});

test('sanitizeSettings drops bad theme and non-string paths', () => {
  assert.deepEqual(sanitizeSettings({ projects: ['a', 3, 'a', ' '], theme: 'Z' }), { projects: ['a'], active: 'a', theme: 'A', layout: 'layers', showDocs: false });
  assert.deepEqual(sanitizeSettings(null ?? {}), { projects: [], active: null, theme: 'A', layout: 'layers', showDocs: false });
});

test('settings round trip; corrupt file gives defaults', () => {
  const f = fakeLogs();
  const file = path.join(f.dir, 'settings.local.json');
  saveSettings(file, { projects: ['x', 'y'], active: 'y', theme: 'C' });
  assert.deepEqual(loadSettings(file), { projects: ['x', 'y'], active: 'y', theme: 'C', layout: 'layers', showDocs: false });
  fs.writeFileSync(file, '{oops');
  assert.deepEqual(loadSettings(file), { projects: [], active: null, theme: 'A', layout: 'layers', showDocs: false });
});

test('nothing changed: cache file is not rewritten', () => {
  const f = fakeLogs();
  assert.equal(scanProject('G:/Proj', f).length, 2);
  fs.rmSync(f.cacheFile);
  assert.equal(scanProject('G:/Proj', f).length, 2);
  assert.equal(fs.existsSync(f.cacheFile), false);
});

test('a file that fails to load is skipped, the rest still return', () => {
  const f = fakeLogs();
  const o = { ...f, onParse: file => { if (file.endsWith('s1.jsonl')) throw Object.assign(new Error('locked'), { code: 'EBUSY' }); } };
  assert.deepEqual(scanProject('G:/Proj', o).map(s => s.id), ['cx1']);
});
