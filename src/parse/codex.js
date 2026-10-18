import { readJsonl, newSession, newPrompt, finishSession } from '../model.js';
import { codexTouches } from './touches.js';

export const NO_TEXT = '(no text)';

// Codex injects AGENTS.md and environment blocks as user messages; the typed text is the rest.
const isInjected = t => t.startsWith('<') || t.startsWith('# AGENTS.md');

export function parseCodexRollout(text, opts) {
  const { rows, bad } = readJsonl(text);
  const s = newSession({ client: 'codex', file: opts.file, badLines: bad });
  const byTurn = new Map(); // turn_id -> prompt
  const seen = new Set();
  let model = null;
  let cur = null;

  const startPrompt = (turnId, start) => {
    cur = newPrompt(s.prompts.length, null, start);
    s.prompts.push(cur);
    if (turnId) byTurn.set(turnId, cur);
  };

  for (const l of rows) {
    const p = l.payload || {};
    if (l.timestamp) { s.start ??= l.timestamp; s.end = l.timestamp; }

    if (l.type === 'session_meta') {
      s.id = p.id ?? p.session_id ?? null;
      s.project = p.cwd ?? null;
    } else if (l.type === 'turn_context') {
      model = p.model ?? model;
    } else if (l.type === 'event_msg' && p.type === 'task_started') {
      startPrompt(p.turn_id, l.timestamp);
    } else if (l.type === 'event_msg' && p.type === 'token_count') {
      const pct = p.rate_limits?.primary?.used_percent;
      if (typeof pct === 'number') s.rateLimitPercent = pct;
    } else if (l.type === 'response_item' && p.type === 'message' && p.role === 'user') {
      if (!cur || cur.text !== null) continue;
      const typed = (p.content || []).find(c => c.type === 'input_text' && c.text && !isInjected(c.text));
      if (typed) cur.text = typed.text;
    } else if (l.type === 'token_usage_record') {
      const u = p.usage;
      if (!u || !p.response_id || seen.has(p.response_id)) continue;
      seen.add(p.response_id);
      const target = byTurn.get(p.turn_id) ?? cur ?? (startPrompt(null, l.timestamp), cur);
      const cached = u.cached_input_tokens || 0;
      const write = u.cache_write_input_tokens || 0;
      target.calls.push({
        requestId: p.response_id,
        model,
        timestamp: l.timestamp,
        // ponytail: assumes input_tokens includes cache writes as it includes cached reads; writes were 0 in every log seen
        fresh: (u.input_tokens || 0) - cached - write,
        cacheWrite5m: write,
        cacheWrite1h: 0,
        cacheRead: cached,
        output: u.output_tokens || 0,
        thinking: u.reasoning_output_tokens || 0,
        added: [],
        subagent: false,
        cost: null,
      });
    }
  }

  for (const pr of s.prompts) pr.text ??= NO_TEXT;
  s.touches = codexTouches(rows);
  s.title = s.prompts.find(pr => pr.text !== NO_TEXT)?.text.slice(0, 60) ?? null;
  return finishSession(s);
}
