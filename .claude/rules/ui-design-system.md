# Rule: UI Design System

**Scope:** Project.

---

## Policy

The tool ships **four switchable themes**, chosen in Settings. Every screen is built once and themed by tokens; no screen hard-codes a colour or font.

| Theme | Look | Source |
|---|---|---|
| A. Midnight Craft (default) | Near-black, one lavender accent, surfaces by tone step | `vendor/awesome-design-md/design-md/linear.app/DESIGN.md` |
| B. Paper Workspace | Warm off-white, serif headline, pastel tags | `.claude/skills/minimalist-skill` |
| C. Blueprint | Swiss print, newsprint ground, heavy black type, hazard red, visible grid | `.claude/skills/brutalist-skill` (Swiss Industrial Print) |
| D. Signal Terminal | Dark CRT, monospace, one red, one green readout | `.claude/skills/brutalist-skill` (Tactical Telemetry) |

A theme is colour + type tokens plus a few structural flags: node shape, label case, edge routing (curved or orthogonal).

- Any new screen is checked in all four themes before it is called done.
- Apply `taste-skill`'s house-rule bans where they do not contradict a theme (no gradients, no glass, no eyebrow labels, no emoji, surfaces separated by tone). Theme C and D intentionally keep rules, monospace and uppercase — the theme wins there.
- `taste-skill`'s `draw.mjs` run (direction dealing, imagery floor, motion count) targets landing pages and says "Not for dashboards or app screens". Do not run it for tool screens.
- Theme mockups from the brainstorm: `G:\tmp\brain-lens-brainstorm\.superpowers\brainstorm\` (`visual-style.html`, `visual-style-graph.html`).

## Why

Owner chose all four looks on 2026-10-18 and wants to switch between them. Tokens-per-theme keeps four looks to one build.
