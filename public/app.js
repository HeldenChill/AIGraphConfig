import { compact, exact, money } from './format.js';
import { stackedBar, promptTimeline } from './charts.js';
import { h, api } from './dom.js';
import { renderGraph } from './graph.js';

const COST_LABEL = 'API-equivalent cost';
const TOKEN_COLS = [
  ['fresh', 'Fresh in'],
  ['cacheWrite', 'Cache write'],
  ['cacheRead', 'Cache read'],
  ['output', 'Output'],
];

// --- helpers -------------------------------------------------------------


const write = t => t.cacheWrite5m + t.cacheWrite1h;
const tokenTotal = t => t.fresh + write(t) + t.cacheRead + t.output;
const field = (t, key) => (key === 'cacheWrite' ? write(t) : t[key]);
const num = n => h('td', { class: 'n', title: exact(n) }, compact(n));
const cost = c => h('td', { class: 'n' }, money(c));
const day = iso => (iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const time = iso => (iso ? new Date(iso).toLocaleTimeString('en-GB') : '–');
const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

function unpricedBanner(models) {
  return models.length ? h('div', { class: 'banner' }, `No price for: ${models.join(', ')}. Their tokens are shown; their cost is left out.`) : null;
}

// --- router --------------------------------------------------------------

function parseHash() {
  const [pathPart, query = ''] = location.hash.slice(1).split('?');
  return { parts: (pathPart || '/').split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(query) };
}

async function route() {
  const main = document.getElementById('main');
  main.replaceChildren(h('p', { class: 'meta' }, 'Loading…'));
  try {
    const { parts, query } = parseHash(); // throws on a malformed hash such as %E0
    if (parts[0] === 'settings') await renderSettings(main);
    else if (parts[0] === 'graph') await renderGraph(main, query);
    else if (parts[0] === 's' && parts[3] === 'p') await renderPrompt(main, parts[1], parts[2], Number(parts[4]));
    else if (parts[0] === 's') await renderSession(main, parts[1], parts[2]);
    else await renderSessions(main, query);
  } catch (e) {
    main.replaceChildren(h('div', { class: 'banner' }, `Error: ${e.message}`));
  }
}

// --- sessions list -------------------------------------------------------

async function renderSessions(main, q) {
  const params = new URLSearchParams();
  for (const k of ['client', 'from', 'to']) if (q.get(k)) params.set(k, q.get(k));
  const data = await api('/api/sessions?' + params);
  if (!data.project) {
    main.replaceChildren(h('p', {}, 'No project set. ', h('a', { href: '#/settings' }, 'Add one in Settings.')));
    return;
  }

  const sortKey = q.get('sort') || 'start';
  const dir = q.get('dir') === 'asc' ? 1 : -1;
  const sortValue = {
    start: s => s.start || '', title: s => s.title || '', client: s => s.client, model: s => s.model || '',
    prompts: s => s.promptCount, cost: s => s.cost ?? -1,
    fresh: s => s.totals.fresh, cacheWrite: s => write(s.totals), cacheRead: s => s.totals.cacheRead, output: s => s.totals.output,
  }[sortKey] || (s => s.start || '');
  const rows = [...data.sessions].sort((a, b) => {
    const x = sortValue(a), y = sortValue(b);
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });

  const setQuery = (changes) => {
    const next = new URLSearchParams(q);
    for (const [k, v] of Object.entries(changes)) v ? next.set(k, v) : next.delete(k);
    location.hash = '#/?' + next;
  };
  const header = (key, label, numeric) =>
    h('th', { class: numeric ? 'n' : null, onclick: () => setQuery({ sort: key, dir: sortKey === key && dir === -1 ? 'asc' : 'desc' }) },
      label + (sortKey === key ? (dir === 1 ? ' ▲' : ' ▼') : ''));

  const sum = key => data.sessions.reduce((n, s) => n + field(s.totals, key), 0);
  const priced = data.sessions.map(s => s.cost).filter(c => c !== null);

  main.replaceChildren(
    h('h1', {}, 'Sessions'),
    h('p', { class: 'meta' }, `${data.project} · scanned ${day(data.scannedAt)}`),
    h('div', { class: 'filters' },
      h('label', {}, 'Client', h('select', { onchange: e => setQuery({ client: e.target.value }) },
        ['', 'claude', 'codex'].map(c => h('option', { value: c, selected: (q.get('client') || '') === c }, c || 'All')))),
      h('label', {}, 'From', h('input', { type: 'date', value: q.get('from') || '', onchange: e => setQuery({ from: e.target.value }) })),
      h('label', {}, 'To', h('input', { type: 'date', value: q.get('to') || '', onchange: e => setQuery({ to: e.target.value }) }))),
    unpricedBanner(data.unpriced),
    h('table', {},
      h('thead', {}, h('tr', {},
        header('start', 'Date'), header('title', 'Title'), header('client', 'Client'), header('model', 'Model'),
        header('prompts', 'Prompts', true), TOKEN_COLS.map(([k, l]) => header(k, l, true)), header('cost', COST_LABEL, true))),
      h('tbody', {}, rows.map(s => h('tr', { class: 'link', onclick: () => (location.hash = `#/s/${s.client}/${encodeURIComponent(s.id)}`) },
        h('td', {}, day(s.start)), h('td', { class: 'text', title: s.title || '' }, s.title || s.id), h('td', {}, s.client),
        h('td', {}, s.model || '–'), num(s.promptCount), TOKEN_COLS.map(([k]) => num(field(s.totals, k))), cost(s.cost)))),
      h('tfoot', {}, h('tr', {},
        h('td', { colspan: 4 }, `Total, ${data.sessions.length} sessions`), num(data.sessions.reduce((n, s) => n + s.promptCount, 0)),
        TOKEN_COLS.map(([k]) => num(sum(k))), cost(priced.length ? priced.reduce((a, b) => a + b, 0) : null)))));
}

// --- session view --------------------------------------------------------

function totalsBar(t) {
  const segments = [
    { label: 'Fresh in', value: t.fresh, color: 'var(--s-fresh)' },
    { label: 'Cache write', value: write(t), color: 'var(--s-write)' },
    { label: 'Cache read', value: t.cacheRead, color: 'var(--s-read)' },
    { label: 'Output', value: t.output, color: 'var(--s-output)' },
  ];
  return [
    stackedBar(segments),
    h('div', { class: 'legend meta' }, segments.map(s =>
      h('span', { title: exact(s.value) }, h('i', { style: `background:${s.color}` }), `${s.label} ${compact(s.value)}`))),
  ];
}

function setupPanel(s) {
  if (!s.setupPieces) {
    return h('div', { class: 'panel' }, h('h2', {}, 'Setup pieces'),
      h('p', { class: 'note' }, s.client === 'codex' ? 'Codex logs no setup split.' : 'No request shape in this log.'));
  }
  const est = s.setupPieces.reduce((n, p) => n + p.estTokens, 0);
  const hasTools = s.setupPieces.some(p => p.kind === 'tools');
  return h('div', { class: 'panel' },
    h('h2', {}, 'Setup pieces'),
    h('p', { class: 'meta' }, `Estimate ${compact(est)} tokens · first call cache write ${exact(s.firstCallCacheWrite ?? 0)} (exact)`),
    h('ul', { class: 'list' },
      [...s.setupPieces].sort((a, b) => b.chars - a.chars).map(p => h('li', {},
        h('span', {}, cut(p.name, 70), ' ', h('span', { class: 'tag' }, p.kind)),
        h('span', { class: 'num', title: `${exact(p.chars)} chars` }, `~${compact(p.estTokens)} estimate`))),
      hasTools ? null : h('li', {}, h('span', {}, 'Tool definitions'), h('span', { class: 'note' }, 'not in log'))));
}

function hooksPanel(prompts) {
  const byHook = new Map();
  for (const p of prompts) for (const i of p.hookInjections) {
    const v = byHook.get(i.hook) || { count: 0, chars: 0, estTokens: 0 };
    byHook.set(i.hook, { count: v.count + 1, chars: v.chars + i.chars, estTokens: v.estTokens + i.estTokens });
  }
  return h('div', { class: 'panel' }, h('h2', {}, 'Hook injections'),
    byHook.size === 0 ? h('p', { class: 'note' }, 'None in this session.') :
      h('ul', { class: 'list' }, [...byHook].sort((a, b) => b[1].chars - a[1].chars).map(([hook, v]) => h('li', {},
        h('span', {}, hook),
        h('span', { class: 'num', title: `${exact(v.chars)} chars` }, `${v.count}× · ~${compact(v.estTokens)} estimate`)))));
}

async function renderSession(main, client, id) {
  const s = await api(`/api/session/${client}/${encodeURIComponent(id)}`);
  const t = s.totals;
  const inputAll = t.fresh + write(t) + t.cacheRead;
  const hitRate = inputAll ? Math.round((t.cacheRead / inputAll) * 100) : 0;
  const open = i => (location.hash = `#/s/${client}/${encodeURIComponent(id)}/p/${i}`);

  main.replaceChildren(
    h('p', { class: 'meta' }, h('a', { href: '#/' }, 'Sessions'), ` / ${s.client} · ${s.model || '–'} · ${day(s.start)} to ${time(s.end)}`),
    h('h1', {}, s.title || s.id),
    h('p', { class: 'meta' }, h('a', { href: `#/graph?session=${encodeURIComponent(`${client}/${id}`)}` }, 'Show on map')),
    unpricedBanner(s.unpriced),
    h('div', { class: 'big', title: exact(tokenTotal(t)) }, compact(tokenTotal(t)),
      h('small', {}, `tokens · ${hitRate}% cache read · ${COST_LABEL} ${money(s.cost)}`)),
    s.rateLimitPercent !== null ? h('p', { class: 'meta' }, `Usage limit ${s.rateLimitPercent}% (from the Codex log)`) : null,
    s.badLines ? h('p', { class: 'note' }, `${s.badLines} unreadable log lines skipped.`) : null,
    h('div', { class: 'panel' }, totalsBar(t)),
    h('div', { class: 'grid2' }, setupPanel(s), hooksPanel(s.prompts)),
    h('div', { class: 'panel' }, h('h2', {}, `Prompts, bar height = ${COST_LABEL}`), promptTimeline(s.prompts, open)),
    h('div', { class: 'panel' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'No.'), h('th', {}, 'Time'), h('th', {}, 'Prompt'), h('th', { class: 'n' }, 'Calls'),
        TOKEN_COLS.map(([, l]) => h('th', { class: 'n' }, l)), h('th', { class: 'n' }, COST_LABEL))),
      h('tbody', {}, s.prompts.map(p => h('tr', { class: 'link', onclick: () => open(p.index) },
        h('td', {}, p.index), h('td', {}, time(p.start)), h('td', { class: 'text', title: p.text }, cut(p.text, 90)),
        num(p.calls.length), TOKEN_COLS.map(([k]) => num(field(p.totals, k))), cost(p.cost)))))));
}

// --- prompt view ---------------------------------------------------------

async function renderPrompt(main, client, id, index) {
  const s = await api(`/api/session/${client}/${encodeURIComponent(id)}`);
  const p = s.prompts[index];
  if (!p) throw new Error(`no prompt ${index}`);
  const back = `#/s/${client}/${encodeURIComponent(id)}`;
  const cols = [['fresh', 'Fresh in'], ['cacheWrite5m', 'Write 5m'], ['cacheWrite1h', 'Write 1h'], ['cacheRead', 'Cache read'], ['output', 'Output'], ['thinking', 'Thinking']];

  main.replaceChildren(
    h('p', { class: 'meta' }, h('a', { href: '#/' }, 'Sessions'), ' / ', h('a', { href: back }, s.title || s.id), ` / prompt ${p.index}`),
    h('h1', {}, `Prompt ${p.index}`),
    h('div', { class: 'prompt-text' }, p.text),
    h('div', { class: 'big', title: exact(tokenTotal(p.totals)) }, compact(tokenTotal(p.totals)),
      h('small', {}, `tokens · ${p.calls.length} calls · ${COST_LABEL} ${money(p.cost)}`)),
    h('div', { class: 'panel' }, totalsBar(p.totals)),
    h('div', { class: 'panel' }, h('h2', {}, 'Hook injections'),
      p.hookInjections.length === 0 ? h('p', { class: 'note' }, 'None.') :
        h('ul', { class: 'list' }, p.hookInjections.map(i =>
          h('li', {}, h('span', {}, i.hook), h('span', { class: 'num', title: `${exact(i.chars)} chars` }, `~${compact(i.estTokens)} estimate`))))),
    h('div', { class: 'panel' }, h('h2', {}, 'API calls'),
      s.client === 'codex' ? h('p', { class: 'note' }, 'Codex logs no tool detail per call.') : null,
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'No.'), h('th', {}, 'Time'), h('th', {}, 'Model'),
          cols.map(([, l]) => h('th', { class: 'n' }, l)), h('th', { class: 'n' }, COST_LABEL), h('th', {}, 'Added'), h('th', {}, ''))),
        h('tbody', {}, p.calls.map((c, i) => h('tr', {},
          h('td', {}, i + 1), h('td', {}, time(c.timestamp)), h('td', {}, c.model || '–'),
          cols.map(([k]) => num(c[k])), cost(c.cost),
          h('td', { class: 'added' }, c.added.map(a => `${a.tool} ${a.target} ${compact(a.chars)} chars`).join('\n')),
          h('td', {}, c.subagent ? h('span', { class: 'tag' }, 'subagent') : '')))))));
}

// --- settings ------------------------------------------------------------

const THEMES = [['A', 'Midnight Craft'], ['B', 'Paper Workspace'], ['C', 'Blueprint'], ['D', 'Signal Terminal']];
const LAYOUTS = [['layers', 'Layers, left to right'], ['clusters', 'Clusters by hub']];

async function renderSettings(main) {
  const s = await api('/api/settings');
  const save = async next => {
    await api('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    route();
  };
  const input = h('input', { type: 'text', placeholder: 'G:\\Unity\\Project\\PetVsMonster', size: 50 });

  main.replaceChildren(
    h('h1', {}, 'Settings'),
    h('div', { class: 'panel' }, h('h2', {}, 'Projects'),
      s.projects.length === 0 ? h('p', { class: 'note' }, 'No projects yet.') : null,
      h('ul', { class: 'list' }, s.projects.map(p => h('li', {},
        h('label', {}, h('input', { type: 'radio', name: 'active', checked: p === s.active, onchange: () => save({ active: p }) }), ' ', p),
        h('button', { onclick: () => save({ projects: s.projects.filter(x => x !== p) }) }, 'Remove')))),
      h('div', { class: 'filters' }, input,
        h('button', { onclick: () => input.value.trim() && save({ projects: [...s.projects, input.value.trim()], active: input.value.trim() }) }, 'Add'))),
    h('div', { class: 'panel' }, h('h2', {}, 'Theme'),
      h('div', { class: 'cards' }, THEMES.map(([key, name]) => h('label', {},
        h('input', { type: 'radio', name: 'theme', checked: key === s.theme, onchange: () => {
          document.documentElement.dataset.theme = key;
          save({ theme: key });
        } }), ` ${key}. ${name}`))),
      h('p', { class: 'meta' }, h('a', { href: '/theme-check.html' }, 'Open the theme check page'))),
    h('div', { class: 'panel' }, h('h2', {}, 'Graph'),
      h('div', { class: 'filters' }, LAYOUTS.map(([key, name]) => h('label', { class: 'inline' },
        h('input', { type: 'radio', name: 'layout', checked: key === s.layout, onchange: () => save({ layout: key }) }), ` ${name}`))),
      h('label', { class: 'inline' }, h('input', { type: 'checkbox', checked: s.showDocs, onchange: e => save({ showDocs: e.target.checked }) }), ' Show docs/ files')),
    h('div', { class: 'panel' }, h('h2', {}, 'Data'),
      h('p', { class: 'meta' }, `Price table: ${s.pricesFile || '–'}`),
      h('p', { class: 'meta' }, `Last scan: ${day(s.scannedAt)}`)));
}

// --- start ---------------------------------------------------------------

async function start() {
  const forced = new URLSearchParams(location.search).get('theme');
  let theme = forced;
  if (!theme) {
    try { theme = (await api('/api/settings')).theme; } catch { theme = 'A'; }
  }
  document.documentElement.dataset.theme = theme;
  window.addEventListener('hashchange', route);
  route();
}

start();
