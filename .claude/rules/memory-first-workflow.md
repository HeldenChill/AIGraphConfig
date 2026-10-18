---
description: Check the memory index first (hubs + grep) before reading source; verify against code before edits
---
# Rule: Memory-First Workflow

**Scope:** Project-specific — update the PROJECT CONFIG block when moving to a new project.

---

## PROJECT CONFIG
```
CURSOR_MEMORY_DIR    = .cursor/memory
MEMORY_MASTER_INDEX  = .cursor/memory/mem-arch-assemblies-canonical.md
INDEX_HOOK           = .claude/hooks/memory-index-injector.js (UserPromptSubmit)
```

---

## Policy (universal — do not change)

For **any task or question** about project architecture, systems, features, or decisions, follow this order:

1. **Check the memory index first.** The `UserPromptSubmit` hook prints the domain hubs (index rows starting `HUB:`) and the grep command. For any other topic run `grep -i "<keyword>" <MEMORY_MASTER_INDEX>` (two-column table: `| description | `mem-file.md` |`) before doing anything else.
2. **If a memory covers the topic, read that `<CURSOR_MEMORY_DIR>/mem-*.md` file** — not the source files. The memory exists so you do not have to rebuild the picture by reading code.
3. **Read source files only for gaps** the memory does not cover, or for the verification step below.
4. **Do not read source files to reconstruct something a memory already holds.** That wastes tokens — it is the exact waste this rule exists to prevent.

### Verification (staleness guard)

Memory reflects what was true **when written** and can drift from code.

- **For explanations / big-picture answers:** trust memory.
- **Before a code edit, or any version-specific / exact-signature claim:** re-check the relevant fact against the actual source file first. Memory points you to the right file fast; the file is authoritative for the edit.
- If memory and code disagree, the **code wins** — then update the memory file (see [memory-write-rules.md](memory-write-rules.md)).

### Keeping the index usable

- This workflow depends on the memory index being current. Whenever you add a `mem-*.md` file, add one two-column row to the `## Memory index` table of `<MEMORY_MASTER_INDEX>`, inside the `LOCAL-MEMORY-INDEX` sentinels (see [memory-write-rules.md](memory-write-rules.md)).
- The hook prints only the `HUB:` rows of that table; every other row is found with grep.

## Relationship to other rules

- [memory-write-rules.md](memory-write-rules.md) defines *how* to write memory. This rule defines how to *consume* it.

## Why

- Memory is a distilled, full-picture summary. Reading it costs a fraction of re-reading the source files it summarizes.
- Reaching for memory first — and only falling through to source for genuine gaps or verification — keeps answers grounded while cutting token cost on every architecture/systems task.
- Claude Code shows only a short preview of a very large hook output, so the hook is kept small (hubs + grep) and the full index is searched on demand.
