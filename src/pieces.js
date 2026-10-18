import { estTokens } from './model.js';

// The one place that decides what a setup file is.
function fileKind(file) {
  const p = file.path || '';
  if (file.type === 'AutoMem' || /MEMORY\.md$/i.test(p)) return 'memory-index';
  if (/[\\/]rules[\\/]/i.test(p)) return 'rule';
  if (/(CLAUDE|AGENTS)\.md$/i.test(p)) return 'claude-md';
  return 'other';
}

const first = (attachments, type) => attachments.find(a => a.type === type);

function piece(name, kind, text) {
  const chars = text.length;
  return { name, kind, chars, estTokens: estTokens(chars) };
}

// input = { system: string[], tools: object[] | null, attachments: attachment objects from the log }
export function splitSetupPieces({ system, tools, attachments }) {
  const pieces = [piece('System prompt', 'base', system.join(''))];

  for (const f of first(attachments, 'instructions')?.files || []) {
    pieces.push(piece(f.path, fileKind(f), f.content || ''));
  }
  const skills = first(attachments, 'skill_listing');
  if (skills) pieces.push(piece('Skill list', 'skills', skills.content || ''));
  const mcp = first(attachments, 'mcp_instructions_delta');
  if (mcp) pieces.push(piece('MCP server instructions', 'mcp', (mcp.addedBlocks || []).join('')));
  if (tools) pieces.push(piece('Tool definitions', 'tools', JSON.stringify(tools)));

  const order = ['base', 'claude-md', 'rule', 'memory-index', 'other', 'skills', 'mcp', 'tools'];
  return pieces.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export function wholeChars({ system, tools, attachments }) {
  const ins = first(attachments, 'instructions')?.files || [];
  return system.join('').length
    + ins.reduce((n, f) => n + (f.content || '').length, 0)
    + (first(attachments, 'skill_listing')?.content || '').length
    + (first(attachments, 'mcp_instructions_delta')?.addedBlocks || []).join('').length
    + (tools ? JSON.stringify(tools).length : 0);
}
