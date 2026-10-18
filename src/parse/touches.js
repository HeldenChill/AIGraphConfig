import path from 'node:path';
import { namedIn } from '../graph/classify.js';

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const COMMAND_TOOLS = new Set(['Bash', 'PowerShell', 'Grep', 'Glob']);
const AGENTS_HEADER = '# AGENTS.md instructions for ';

// Touch = { how: startup|hook|skill|read|write|named, target: string|null, event: string|null, count }
function counter() {
  const counts = new Map();
  const add = (how, target, event = null) => {
    if (typeof target !== 'string' && !(how === 'hook' && event)) return;
    const k = `${how}\0${event ?? ''}\0${target ?? ''}`;
    const t = counts.get(k);
    if (t) t.count++;
    else counts.set(k, { how, target: target ?? null, event, count: 1 });
  };
  return { add, list: () => [...counts.values()] };
}

// rowLists = [main rows, ...subagent rows]. A tool_use id seen in two files counts once.
export function claudeTouches(rowLists) {
  const { add, list } = counter();
  const seenTools = new Set();
  for (const rows of rowLists) {
    // Hook runs logged with their command; context lines with the same toolUseID are not counted again.
    const ran = new Set(rows.filter(l => l.attachment?.type === 'hook_success').map(l => l.attachment.toolUseID));
    for (const l of rows) {
      const a = l.type === 'attachment' ? l.attachment : null;
      if (a?.type === 'instructions') {
        for (const f of a.files || []) add('startup', f.path);
      } else if (a?.type === 'hook_success') {
        add('hook', a.command, a.hookEvent ?? null);
      } else if (a?.type === 'hook_additional_context') {
        if (!ran.has(a.toolUseID)) add('hook', null, a.hookEvent || a.hookName || null);
      } else if (l.type === 'assistant') {
        for (const b of l.message?.content || []) {
          if (b.type !== 'tool_use' || seenTools.has(b.id)) continue;
          seenTools.add(b.id);
          const i = b.input || {};
          if (b.name === 'Skill') add('skill', i.skill);
          else if (b.name === 'Read') add('read', i.file_path);
          else if (WRITE_TOOLS.has(b.name)) add('write', i.file_path ?? i.notebook_path);
          else if (COMMAND_TOOLS.has(b.name)) {
            const text = [i.command, i.pattern, i.path].filter(x => typeof x === 'string').join(' ');
            for (const tok of namedIn(text)) add('named', tok);
          }
        }
      }
    }
  }
  return list();
}

// Codex reads files through commands and code it runs; AGENTS.md arrives as one injected user message.
export function codexTouches(rows) {
  const { add, list } = counter();
  for (const l of rows) {
    const p = l.payload;
    if (!p) continue;
    if (l.type === 'response_item' && p.type === 'message' && p.role === 'user') {
      for (const c of p.content || []) {
        const t = typeof c.text === 'string' ? c.text : '';
        if (t.startsWith(AGENTS_HEADER)) add('startup', path.join(t.split('\n')[0].slice(AGENTS_HEADER.length).trim(), 'AGENTS.md'));
      }
    } else if (p.type === 'custom_tool_call' && typeof p.input === 'string') {
      for (const tok of namedIn(p.input)) add('named', tok);
    } else if (p.type === 'function_call' && typeof p.arguments === 'string') {
      for (const tok of namedIn(p.arguments)) add('named', tok);
    }
  }
  return list();
}
