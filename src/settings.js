import fs from 'node:fs';

export const THEMES = ['A', 'B', 'C', 'D'];

export function sanitizeSettings(raw = {}) {
  const list = Array.isArray(raw.projects) ? raw.projects : [];
  const projects = [...new Set(list.filter(p => typeof p === 'string' && p.trim()).map(p => p.trim()))];
  const active = projects.includes(raw.active) ? raw.active : (projects[0] ?? null);
  const theme = THEMES.includes(raw.theme) ? raw.theme : 'A';
  return { projects, active, theme };
}

export function loadSettings(file) {
  try { return sanitizeSettings(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { return sanitizeSettings({}); }
}

export function saveSettings(file, raw) {
  const s = sanitizeSettings(raw);
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  return s;
}
