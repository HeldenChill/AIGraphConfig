import { FIELDS, readJsonl, newSession, newPrompt, finishSession, estTokens } from '../model.js';
import { splitSetupPieces } from '../pieces.js';
import { claudeTouches } from './touches.js';

export const BEFORE_FIRST_PROMPT = '(before first prompt)';
const TARGET_KEYS = ['file_path', 'path', 'pattern', 'command', 'url'];

const textOf = c =>
  typeof c === 'string' ? c
  : Array.isArray(c) ? (c.find(b => b.type === 'text')?.text ?? null)
  : null;
const hasToolResult = c => Array.isArray(c) && c.some(b => b.type === 'tool_result');
const resultChars = c =>
  typeof c === 'string' ? c.length
  : Array.isArray(c) ? c.reduce((n, b) => n + (typeof b.text === 'string' ? b.text.length : 0), 0)
  : 0;

function targetOf(input = {}) {
  for (const k of TARGET_KEYS) if (typeof input[k] === 'string') return input[k].slice(0, 80);
  return '';
}

const isCallLine = l =>
  l.type === 'assistant' && l.requestId && l.message?.usage && l.message.model !== '<synthetic>';

function toCall(l) {
  const u = l.message.usage;
  const split = u.cache_creation;
  const write = u.cache_creation_input_tokens || 0;
  return {
    requestId: l.requestId,
    model: l.message.model,
    timestamp: l.timestamp,
    fresh: u.input_tokens || 0,
    // No 5m/1h split in the log: the whole write counts as 5m.
    cacheWrite5m: split ? (split.ephemeral_5m_input_tokens || 0) : write,
    cacheWrite1h: split ? (split.ephemeral_1h_input_tokens || 0) : 0,
    cacheRead: u.cache_read_input_tokens || 0,
    output: u.output_tokens || 0,
    thinking: u.output_tokens_details?.thinking_tokens || 0,
    added: [],
    subagent: !!l.isSidechain,
    cost: null,
  };
}

export function parseClaudeSession(text, opts) {
  const { rows, bad } = readJsonl(text);
  const s = newSession({ id: opts.id, client: 'claude', project: opts.project, file: opts.file, badLines: bad });

  // Modern logs mark typed prompts with origin.kind "human"; older logs fall back to content shape.
  const hasOrigin = rows.some(l => l.type === 'user' && l.origin);
  const isPrompt = l =>
    l.type === 'user' && !l.isSidechain && l.message &&
    (hasOrigin
      ? l.origin?.kind === 'human'
      : !l.isMeta && !l.interruptedMessageId &&
        textOf(l.message.content) !== null && !hasToolResult(l.message.content));

  const seen = new Map(); // requestId -> call
  const pendingTools = new Map(); // tool_use id -> { tool, target }
  const attachments = [];
  let preHooks = []; // SessionStart hooks arrive before the first prompt
  let added = [];
  let cur = null;

  const startPrompt = (promptText, start) => {
    cur = newPrompt(s.prompts.length, promptText, start);
    cur.hookInjections.push(...preHooks);
    preHooks = [];
    s.prompts.push(cur);
  };

  for (const l of rows) {
    if (l.timestamp) { s.start ??= l.timestamp; s.end = l.timestamp; }

    if (l.type === 'ai-title' && l.aiTitle) {
      s.title = l.aiTitle;
    } else if (isPrompt(l)) {
      startPrompt(textOf(l.message.content) ?? '', l.timestamp);
    } else if (l.type === 'attachment' && l.attachment) {
      const a = l.attachment;
      if (a.type === 'hook_additional_context') {
        const chars = Array.isArray(a.content) ? a.content.join('').length : String(a.content ?? '').length;
        const hook = { hook: a.hookName || a.hookEvent || 'unknown', chars, estTokens: estTokens(chars) };
        (cur ? cur.hookInjections : preHooks).push(hook);
      } else {
        attachments.push(a);
      }
    } else if (l.type === 'user' && Array.isArray(l.message?.content)) {
      for (const b of l.message.content) {
        if (b.type !== 'tool_result' || !pendingTools.has(b.tool_use_id)) continue;
        added.push({ ...pendingTools.get(b.tool_use_id), chars: resultChars(b.content) });
        pendingTools.delete(b.tool_use_id);
      }
    } else if (isCallLine(l)) {
      // One API call writes several lines (one per content block): collect every tool_use,
      // but count usage once per requestId.
      for (const b of l.message.content || []) {
        if (b.type === 'tool_use') pendingTools.set(b.id, { tool: b.name, target: targetOf(b.input) });
      }
      if (seen.has(l.requestId)) { keepLargest(seen.get(l.requestId), toCall(l)); continue; }
      if (!cur) startPrompt(BEFORE_FIRST_PROMPT, l.timestamp);
      const call = toCall(l);
      seen.set(l.requestId, call);
      call.added = added;
      added = [];
      cur.calls.push(call);
    }
  }

  if (preHooks.length && cur === null) startPrompt(BEFORE_FIRST_PROMPT, s.start);

  const extraRows = (opts.extraTexts || []).map(t => readJsonl(t).rows);
  for (const extra of extraRows) addSubagentCalls(s, extra, seen);
  s.touches = claudeTouches([rows, ...extraRows]);

  const shape = rows.find(l => l.type === 'api-request-shape')?.shape;
  if (shape) {
    s.setupPieces = splitSetupPieces({
      system: (shape.system || []).map(b => (typeof b === 'string' ? b : b.text || '')),
      tools: shape.tools ?? null,
      attachments,
    });
  }
  const firstWrite = s.prompts.flatMap(p => p.calls).find(c => c.cacheWrite5m + c.cacheWrite1h > 0);
  s.firstCallCacheWrite = firstWrite ? firstWrite.cacheWrite5m + firstWrite.cacheWrite1h : null;

  return finishSession(s);
}

// Lines of one call can carry partial streaming usage (seen in subagent files): keep the largest.
function keepLargest(call, next) {
  for (const f of FIELDS) call[f] = Math.max(call[f], next[f]);
}

// Subagent transcript files: unseen calls go to the last prompt that started before them.
function addSubagentCalls(s, rows, seen) {
  for (const l of rows) {
    if (!isCallLine(l)) continue;
    if (seen.has(l.requestId)) { keepLargest(seen.get(l.requestId), toCall(l)); continue; }
    const call = { ...toCall(l), subagent: true };
    seen.set(l.requestId, call);
    const target = s.prompts.filter(p => p.start && p.start <= call.timestamp).at(-1) ?? s.prompts.at(-1);
    if (target) target.calls.push(call);
  }
}
