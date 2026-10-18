# Memory: Phase 2 Config Graph

**ID:** `mem-config-graph`
**Parent:** `mem-project-context`
**Status:** 2026-10-19 — **built by Gemini from the plan, reviewed, 4 review findings fixed in code and in the plan.** `node --test` 71/71. Plan text applied to a `HEAD` export reproduces `src/` and `test/` byte for byte (39 operations, 71/71). **Uncommitted.** 8 Minor findings open (below).
**Spec:** [`.cursor/plans/design/2026-10-18-config-graph.md`](../plans/design/2026-10-18-config-graph.md)
**Plan:** [`.cursor/plans/implement/2026-10-18-config-graph.md`](../plans/implement/2026-10-18-config-graph.md) (8 tasks, 2,367 lines, complete code)

## What it is

A Graph screen in the v1 tool: one project's AI config drawn as a map. Every config file is a node; lines are **mentions** (file A names or links file B) and **loads** (a client gets the file, from config and from session logs). Outside sources (global `~/.claude`, `~/.codex`, each enabled plugin) are closed boxes that open into their files. Side panel per file, read-only full-text reader, per-session overlay.

```mermaid
flowchart LR
    Files[Project, global, plugin config] --> Build[build.js graph, cached]
    Logs[v1 session logs] --> Touches[session.touches]
    Build --> Usage[usage.js]
    Touches --> Usage
    Usage --> API[api graph, api file]
    API --> UI[graph.js: Layers or Clusters, 4 themes]
```

## Owner decisions (2026-10-18)

| Decision | Note |
|---|---|
| Purpose | See the big picture of the AI brain; owner had only "a feel" for how config, memory, playbooks connect |
| Duplicates (identical memories, duplicate concepts or bugs) | Out of phase 2; a later "data analysis" phase |
| Lines | Both mentions and loading; loading both by config and by logs |
| Outside files | Black boxes; click opens the sub-graph inside |
| Layout | Both Layers and Clusters, chosen in Settings like theme |
| Click a file | Highlight neighbours, side panel, Read button for full text |
| Session overlay | Pick a session, map lights up what it touched |
| Spec path | `.cursor/plans/design/`, not the `desh-phase2.md` path in the request |

Claude's calls (owner kept or did not object): hubs start closed with "open all"; plain-text reader with node names as links; config side for 4 clients, log side Claude and Codex only; one project per map; chars/4 estimate; hand-written SVG, no library; docs off by default.

## Facts verified on disk (2026-10-18, PvM)

| Fact | Consequence |
|---|---|
| 26 rules, 15 `HUB:` rows, 205 memories with `**Parent:**`, 3 enabled plugins | Test numbers for Task 8 |
| Claude logs `attachment.type: hook_success` with `command` (or the hook's `statusMessage`, or unexpanded `${CLAUDE_PLUGIN_ROOT}`) and `toolUseID`; `UserPromptSubmit` has no `hook_success` lines | Per-script observed hook runs; event-only lines credit all scripts of the event as "named" when several share it |
| Plugin hooks: superpowers in `hooks/hooks.json`, caveman and ponytail in `.claude-plugin/plugin.json` `hooks` | Read both |
| Global `~/.claude/settings.json` runs `C:/Users/PC/.orca/agent-hooks/claude-hook.cmd` on every event | Hook script nodes live in the box of the settings that run them, wherever on disk |
| Codex injects global and project AGENTS.md as one block `# AGENTS.md instructions for <dir>` | One touch credits both |
| Most file reads go through Bash (247 commands name a `mem-` or rule path vs 51 Read calls); Bash uses Git Bash paths `/g/...` | Weaker "named" strength; resolver maps `/g/` to `g:/` |
| Codex reads files via `custom_tool_call` code (`exec_command`, `node_repl`) | Named tokens from `input` / `arguments` |
| Real graph: 680 nodes, 2,959 mention edges, ~1 MB JSON; build 0.7 s, cached 0.06 s | Fine without paging |

## Plan verification method (repeat it)

1. Built all code in a scratch copy (`scratchpad/wt`), `node --test` 69/69.
2. Ran it against PvM; headless Chrome screenshots of all themes and both layouts; CDP script clicked a node, opened a box, Read, followed a reader link, searched, checked Settings and "Show on map".
3. Generated the plan from a template with `<<FILE:path>>` / `<<FROM:path:marker>>` markers spliced from the scratch files (verbatim by construction).
4. `apply-plan.cjs` parsed the plan text and applied every Create / Replace / Append / Find-Replace to a clean copy: byte-identical to scratch, 69/69; per-task cumulative counts 49, 52, 61, 62, 64, 69 checked by applying the plan cut after each task. Both scripts are saved as reusable tools: `G:\Unity\Project\PetVsMonster\.cursor\playbooks\tools\splice-plan-code.cjs` and `apply-plan-text.cjs` (re-verified on a `HEAD` export, 39 operations, 69/69).
5. Review aid: the verified code is the reference. Regenerate it by applying the plan to a `HEAD` export, then `diff -r` against the executor's tree.

Full lessons: PvM playbook `.cursor/playbooks/external-executor-plan-review.md` section 15 (planning) and section 16 (review and fixes).

## Review and fixes (2026-10-19)

Gemini copied every plan block exactly (reviewer compared all 17 Create/Replace blocks and every Find/Replace). So every finding was a defect **in the plan's code**, which the scratch-build proof could not catch: the fake config in `test/helpers.js` only used absolute or `$VAR` hook paths and an in-project index.

| Finding | Fix (code and plan both) |
|---|---|
| Critical: hook script named in settings but missing on disk got `h.nodeId` anyway; a session that fired its event made `usage.js` read `byId.get(id).type` of nothing, so `/api/graph` returned 500 | `collect.js` sets `nodeId` only when `files.has(...)`; test in `usage.test.js` |
| Important: `scriptOf` resolved relative paths against the server's own folder and did not expand `~` | `scriptOf(command, vars, base)` expands a leading `~` to `os.homedir()` and resolves against `base`; `hookEntries` passes `project` for project, global and plugin hooks (Claude Code runs every hook with the project as its working folder) |
| Important: `MEMORY_MASTER_INDEX` value could be `../..` or absolute with any extension, so a cloned repo's rule could put any file into the node set that `/api/file` serves | `collect.js` accepts it only as a `.md` inside the project, else the default path |
| Important (plan dropped a spec line): spec 5.2 "origin shows as node border style" | `graph.js` adds `origin-<x>` class to `.shape`; `app.css` universal dashed `3 2`, generated dotted `1 2`, framework stroke-width 3, all `stroke: var(--text)` (themes A, B, D set `--n-stroke: none`); Legend note. Checked in all four themes at 3x zoom on PvM |

Test counts per task are now 49, 52, 62, 64, 66, 71, 71. The new `applyUsage` check lives in `usage.test.js` (Task 4), not `graph.test.js` (Task 3), because `usage.js` does not exist yet in Task 3.

**Open Minor findings** (not fixed):

1. Graph cache key covers node files only; editing hook JSON (`settings.json`, `hooks.json`, `plugin.json`) or `manifest.json` leaves hook matching and origins stale. Add their stamps to the key in `build.js`.
2. Session picker lists only in-range sessions; a picked out-of-range session lights the map but shows "No session".
3. Overlay adds its groups to `state.open` for good; clearing the session leaves them open.
4. Reader `f.refs` is a plain object; `constructor`/`toString` become fake links. Use `Object.hasOwn`.
5. `visibleGraph` counts merged edges, ignoring log edges' own `count`; the `xN` tooltip understates.
6. Theme D: config load dash `1 3` and mention `2 3` look alike.
7. `touches.js`: a `hook_success` without `toolUseID` puts `undefined` into `ran` and hides other id-less context lines.
8. Resolver suffix match scans every node per token; fine at 680 nodes.

## Running it

`npm start` (= `node src/cli.js`, port 4317, opens the browser), Graph at `/#/graph`. A server started before a code change keeps the old routes: `/api/graph` 404 on 2026-10-19 was a v1 server left running from the night before. Restart after any `src/` change.

## Next

1. Owner decides on the 8 Minor findings.
2. Commit spec, plan, code, tests, `.claude/package.json` and memory on owner's go-ahead (nothing from 2026-10-18 or 2026-10-19 is committed).
