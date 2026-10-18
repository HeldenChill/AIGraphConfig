# Memory: AIConfigGraph Project Context

**ID:** `mem-project-context`
**Status:** 2026-10-18 — brainstorm finished, **spec v1 written and awaiting owner approval**. Nothing built. Workspace files are **not committed** (repo has no commits yet).
**Spec:** [`.cursor/plans/design/2026-10-18-ai-config-graph.md`](../plans/design/2026-10-18-ai-config-graph.md)

## Resume here

1. Ask the owner to approve the spec (or apply their changes). Do not build before approval.
2. On approval: `superpowers:writing-plans` → plan in `.cursor/plans/implement/2026-10-18-ai-config-graph-v1.md`. Refuse its subagent-driven handoff (`skip-subagent-driven-development.md`); execute inline.
3. Owner has not asked for a commit yet. Offer one after approval.

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
| Claude Code | `~/.claude/projects/<slug>/<session>.jsonl` | per call `message.usage` + `requestId`; `promptId` on user lines; `attachment` `hook_additional_context` with hook name + text; `api-request-shape` with the full system prompt once per session; `ai-title` |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | `event_msg` `token_count` per turn (`last_token_usage`: input incl. cached, cached, output, reasoning) + `rate_limits` used percent |
| Cursor | `AppData/Roaming/Cursor/User/workspaceStorage` (SQLite) | not inspected |
| Gemini | `~/.gemini/` | not inspected |

Sample numbers (the brainstorm session `1045f30c`, PvM, 36 calls): 4.6M cache read, 147k cache write, 72 fresh input, 24k output; first call wrote 61k tokens of setup to cache; 48 prompt-hook injections ≈ 36k chars.

## Traps

- **Dedupe Claude calls by `requestId`** — one call writes several `assistant` lines with repeated `usage` (67 lines for 36 calls).
- **Codex `input_tokens` includes cached; Claude's excludes it.** Normalize fresh = input − cached for Codex.
- taste-skill v2 (`design-taste-frontend`) says "Not for dashboards or app screens"; do not run its `draw.mjs` landing-page workflow for tool screens. Use its bans + minimalist/brutalist skills + `vendor/awesome-design-md/design-md/linear.app`.
- The shared memory hook reads `.cursor/memory/mem-arch-assemblies-canonical.md` (fixed path) — that is why this workspace's index has a Unity-sounding name.
- `memory-first-workflow.md` and `memory-write-rules.md` were copied from PvM because the shared hook points at them and the master does not deliver them. Candidate to promote to Universal in `claude-unity-shared`.

## Workspace setup (2026-10-18)

- `project.config.json` with Unity tokens `n/a`; `sync.ps1 pull` from `G:\Unity\claude-unity-shared`: 34 Universal files, 0 warnings, re-run WhatIf 0 changes. Registry generated into `CLAUDE.md` + `AGENTS.md`.
- Skills `taste-skill`, `minimalist-skill`, `brutalist-skill` in `.claude/skills/`; full repos in `vendor/` (commits in `vendor/README.md`). Original clones still in `G:\tmp\design-skills` (deletable).
- Theme mockups: `G:\tmp\brain-lens-brainstorm\.superpowers\brainstorm\657-1792328748\content\` — `visual-style.html` (token report ×4) and `visual-style-graph.html` (config graph ×4). Brainstorm server may have stopped; restart with the superpowers `start-server.sh --project-dir G:/tmp/brain-lens-brainstorm`.
