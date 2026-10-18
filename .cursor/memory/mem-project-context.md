# Memory: AIConfigGraph Project Context

**ID:** `mem-project-context`
**Status:** 2026-10-18 — **v1 token report built** (Gemini, from plan) and verified. `node --test` 48/48 pass. Hand-sum match on PvM `1045f30c`: 78 calls, fresh 156, cache write 210,872, cache read 13,489,241, output 57,786. Not committed yet. Run: `node src/cli.js --project <path>`.
**Spec:** [`.cursor/plans/design/2026-10-18-ai-config-graph.md`](../plans/design/2026-10-18-ai-config-graph.md)
**Plan:** [`.cursor/plans/implement/2026-10-18-ai-config-graph-v1.md`](../plans/implement/2026-10-18-ai-config-graph-v1.md) — its "Findings that refine the spec" table corrects where setup pieces live in the log.

## Resume here

1. Owner confirms the four themes in a browser (`/theme-check.html`): plan Task 7 Step 11 not yet confirmed.
2. Owner review of v1 and commit on owner's go-ahead (`docs: record v1 verification`).
3. Phase 2 config graph: `superpowers:brainstorming` → spec, then a Gemini-ready plan (complete verified code embedded, as v1).

## v1 verification (2026-10-18)

- PvM `1045f30c`: tool = hand sum — 78 calls, fresh 156, cache write 210,872, cache read 13,489,241, output 57,786; API-equivalent cost $5.54. All 15 PvM + 9 Horror1Game Claude sessions match a hand sum of output tokens (incl. subagent files).
- `prices.json`: 5 Anthropic rows, checked against platform.claude.com pricing. OpenAI page blocks fetches (Cloudflare 403) → Codex models show "no price". Haiku 5.5 row = the ≤100k-token-prompt tier (over 100k is 5×, underpriced).
- Review fixes: per-`requestId` usage keeps the largest value (subagent transcripts write partial streaming usage on early lines); parsed cache kept in memory and written only when dirty; an unreadable log file is skipped, not a 500; session detail always rescans; 413 actually returned; CLI exits cleanly on bad or busy port; malformed hash shows an error banner. `PARSER_VERSION` = 2.
- Open, not fixed: date filter compares UTC dates; a Codex prompt starting with `<` is treated as injected; 4 of 43 Codex rollouts total about 2% above the rollout's own `total_token_usage` (maybe compaction, unexplained).

## What the tool is

Local, read-only, single-user web tool (owner only) to see an AI setup and where its tokens go, so the team can find token-efficient ways of working. Born from PvM's SP3 knowledge-map brainstorm. The SP3 spec is copied here as history: [`2026-09-26-sp3-knowledge-map.md`](../plans/design/2026-09-26-sp3-knowledge-map.md) — read it before designing phase 2 (graph). The Notion product-hub vision (tasks, GD data, bugs for the whole team) is PvM's and stays there: `PetVsMonster/.cursor/memory/mem-notion-product-hub.md`, `PetVsMonster/.cursor/plans/design/2026-09-26-notion-product-hub-vision.md`, `2026-10-16-notion-requirements-source-review.md`.

| Phase | Content |
|---|---|
| v1 | Token report: sessions → prompts → API calls; fresh input, cache write 5m/1h, cache read, output, thinking; API-equivalent dollar cost; setup-piece split (base prompt, CLAUDE.md, each rule, skill list, MCP, tools); hook injection cost; 4 themes |
| 2 | Config graph (files as nodes, links and `mem-` refs as edges, grouped by hub, which client receives each file) |
| 3+ | Compare tagged sessions + quality signal; Cursor/Gemini; editing project-owned config; Notion embed; all master projects |

## Owner decisions (2026-10-18)

- Token report first, per session and per prompt, input and output. Compare later.
- Dollar cost in v1.
- PvM first; vision = any project using the master config (project is a settings path).
- Only the owner uses v1.
- Notion optional, never a dependency ("we are not owner of Notion").
- All four looks kept, switchable in Settings — see `.claude/rules/ui-design-system.md`.
- Clients used by the team: Claude, Cursor, Codex, Gemini.

## Claude's calls (owner may revisit)

Node built-ins only, no dependencies, plain HTML/CSS/JS, hand-drawn SVG charts; `node src/cli.js` on 127.0.0.1; Claude then Codex; default theme A; `prices.json` filled from official pricing pages at build time; setup pieces estimated at ~4 chars/token shown beside the exact first-call cache write; dollar figures labelled "API-equivalent cost" (owner is on subscriptions); subagent calls count toward the spawning prompt.

## Data sources verified 2026-10-18

| Client | Log | Has |
|---|---|---|
| Claude Code | `~/.claude/projects/<slug>/<session>.jsonl` (+ `<session>/subagents/*.jsonl` when present) | per call `message.usage` + `requestId`; typed prompts marked `origin.kind: "human"`; `attachment` `hook_additional_context` with hook name + text; `attachment` `instructions` (CLAUDE.md, rules, MEMORY.md as `files`), `skill_listing`, `mcp_instructions_delta`; `api-request-shape` with `shape.system` + `shape.tools`; `ai-title` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `token_usage_record` per API call (`response_id`, `turn_id`, `usage`: input incl. cached, cached, cache write, output, reasoning); `event_msg` `token_count` for `rate_limits` used percent |
| Cursor | `AppData/Roaming/Cursor/User/workspaceStorage` (SQLite) | not inspected |
| Gemini | `~/.gemini/` | not inspected |

Sample numbers (the brainstorm session `1045f30c`, PvM, at 36 calls; the session later grew to 78 calls, see v1 verification): 4.6M cache read, 147k cache write, 72 fresh input, 24k output; first call wrote 61k tokens of setup to cache; 48 prompt-hook injections ≈ 36k chars.

## Traps

- **Dedupe Claude calls by `requestId`** — one call writes several `assistant` lines with repeated `usage` (67 lines for 36 calls). In subagent transcripts the early lines carry partial streaming usage: keep the largest value per field, never the first line.
- **Codex `input_tokens` includes cached; Claude's excludes it.** Normalize fresh = input − cached for Codex.
- Log facts found while writing the v1 plan (2026-10-18): typed Claude prompts carry `origin.kind: "human"`; CLAUDE.md/rules/MEMORY.md arrive in one `attachment` `instructions` with `files[{path,type,content}]`, not in `api-request-shape` `shape.system`; Codex has a per-call `token_usage_record` (`response_id`, `turn_id`, `usage`) in every rollout; logs hold both `claude-opus-5` and `claude-opus-5-5`, so price lookup must not prefix-match. Full table: the plan's "Findings that refine the spec".
- The plan embeds complete, pre-verified code (41 tests pass; parser matched a hand sum on `1045f30c`) so a non-Claude executor (Gemini) can copy it verbatim.
- taste-skill v2 (`design-taste-frontend`) says "Not for dashboards or app screens"; do not run its `draw.mjs` landing-page workflow for tool screens. Use its bans + minimalist/brutalist skills + `vendor/awesome-design-md/design-md/linear.app`.
- The shared memory hook reads `.cursor/memory/mem-arch-assemblies-canonical.md` (fixed path) — that is why this workspace's index has a Unity-sounding name.
- `memory-first-workflow.md` and `memory-write-rules.md` were copied from PvM because the shared hook points at them and the master does not deliver them. Candidate to promote to Universal in `claude-unity-shared`.

## Workspace setup (2026-10-18)

- `project.config.json` with Unity tokens `n/a`; `sync.ps1 pull` from `G:\Unity\claude-unity-shared`: 34 Universal files, 0 warnings, re-run WhatIf 0 changes. Registry generated into `CLAUDE.md` + `AGENTS.md`.
- Skills `taste-skill`, `minimalist-skill`, `brutalist-skill` in `.claude/skills/`; full repos in `vendor/` (commits in `vendor/README.md`). Original clones still in `G:\tmp\design-skills` (deletable).
- Theme mockups: `G:\tmp\brain-lens-brainstorm\.superpowers\brainstorm\657-1792328748\content\` — `visual-style.html` (token report ×4) and `visual-style-graph.html` (config graph ×4). Brainstorm server may have stopped; restart with the superpowers `start-server.sh --project-dir G:/tmp/brain-lens-brainstorm`.
