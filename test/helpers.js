import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
