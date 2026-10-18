---
description: Two-tier memory, `.cursor/memory/` for project knowledge and auto-memory for user preferences and feedback; one two-column index
---
# Rule: Memory Write Rules

**Scope:** Semi-universal — update the PROJECT CONFIG block when moving to a new project.

---

## PROJECT CONFIG
<!-- Update these values for each new project -->

```
CURSOR_MEMORY_DIR = .cursor/memory
CURSOR_MEMORY_PREFIX = mem-
CURSOR_MEMORY_INDEX = .cursor/memory/mem-arch-assemblies-canonical.md (## Memory index table, inside the LOCAL-MEMORY-INDEX sentinels)
CLAUDE_MEMORY_DIR = (per-machine — do NOT hardcode) Claude Code's auto-memory dir for THIS project, i.e. ~/.claude/projects/<this-project's-slug>/memory where <slug> is the absolute project path with drive colon and path separators replaced by dashes. Resolve it at runtime from the active project path; never copy a literal slug here, since it differs per computer (e.g. d--... vs g--...).
```

---

## Policy (universal — do not change)

### Two tiers of memory

| Type of knowledge | Where to write | Format |
|---|---|---|
| Project knowledge — architecture, systems, features, decisions | `<CURSOR_MEMORY_DIR>/<CURSOR_MEMORY_PREFIX><topic>.md` | Heading + sections; **no** Claude Code frontmatter |
| User preferences, feedback, collaboration style | `<CLAUDE_MEMORY_DIR>/` | Claude Code frontmatter format |

### Writing to cursor memory

- File naming: `<CURSOR_MEMORY_PREFIX><topic>.md`.
- When updating an existing file: preserve its structure, heading style, and section order.
- When creating a new file: mirror the style of nearby files — match heading level, table format, code block style.
- After creating a new memory file, add one row `| <one-line description> | `mem-<topic>.md` |` to <CURSOR_MEMORY_INDEX>. Prefix the description with `HUB: ` only for a domain hub. Special collections (e.g. `bugs/README.md`) register their hub once; child domain files are registered in that collection hub. The master context is a domain hub, not a registry.
- Do NOT add Claude Code frontmatter (`---` blocks) to cursor memory files.

### Writing to auto-memory

- Each memory is its own file with a short kebab-case slug as the filename.
- Required frontmatter fields: `name`, `description`, `metadata.type` (`user`, `feedback`, `project`, or `reference`).
- For `feedback` and `project` types: lead with the rule/fact, then a **Why:** line and a **How to apply:** line.
- Update `MEMORY.md` index after writing any new file — one line per entry, under ~150 chars.

### What NOT to save in memory

- Code patterns derivable from reading the current files.
- Git history (use `git log` / `git blame`).
- Debugging solutions (the fix is in the code; the commit message has the context).
- Ephemeral task details or in-progress state.
