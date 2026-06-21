# CYF Decoupling Design Document

> Research and design for separating CYF (Command Your Fleet) from its upstream OpenCode fork at the data, config, and identity layers.

---

## 1. Research Findings

### Fork maintenance and identity separation

Major hard forks consistently begin by carving out a distinct **namespace**—binary name, package names, config/data directories, and on-disk artifacts—before they worry about internal code rewrites. LibreOffice forked OpenOffice.org in 2010 and immediately introduced its own configuration directory (`~/.config/libreoffice`), its own binary names, and the OpenDocument-based file formats as the default save path; it retained import filters for OpenOffice.org formats but never shared user profiles with its parent [Wikipedia: LibreOffice]. MariaDB forked MySQL in 2009 and for years used matching version numbers to signal drop-in compatibility, yet it always used its own data directory, its own service name, and its own socket paths; only later did the project diverge on disk format and authentication protocols [Wikipedia: MariaDB]. The io.js fork of Node.js (2014–2015) renamed the runtime binary and shipped its own npm-compatible registry tooling, but shared the npm ecosystem; its success came from proving that an independent governance and release cadence could coexist with upstream until the projects reconciled [Wikipedia: Node.js, Io.js section]. The common lesson is: **namespace separation is the first-order requirement; source-code rewrites can follow incrementally**.

### Configuration and data-directory migration patterns

The freedesktop.org XDG Base Directory Specification is the dominant convention for where user-specific data, config, cache, and state live on Linux and macOS: each application owns a subdirectory under `~/.config`, `~/.local/share`, `~/.cache`, and `~/.local/state`, named after the application identifier. Clean migration patterns from mature projects fall into two camps: **copy-on-first-run** (duplicate the old tree into the new namespace once, then never look back) and **fresh-start with opt-in import** (leave old data alone and offer an explicit migration command). Firefox, for example, uses profile directories keyed by the vendor/application name and migrates by copying profile contents at install time rather than aliasing the old path. The critical anti-pattern is a **shared mutable namespace**: if two applications write to the same SQLite database or the same config directory, they corrupt each other’s state regardless of how different their binaries are.

### Persistent agent memory and context injection

Academic work on long-horizon LLM agents supports a tiered memory model rather than a single prompt dump. MemGPT introduces *virtual context management*, treating the LLM context window as fast RAM and external stores (databases, files, search indexes) as slow memory, with explicit movement between tiers [arXiv:2310.08560]. Voyager demonstrates a *skill library*—an ever-growing, retrievable, versioned collection of executable behaviors that the agent can load on demand instead of holding all learned behavior in context [arXiv:2305.16291]. Retrieval-Augmented Generation (RAG) for agent rules adds a retrieval layer between durable memory and the working prompt, so only relevant rules are injected per turn. Applied to CYF, this means: Ivan’s `~/.config/cyf/memories/` and `AGENTS.md` files are durable memory; the SystemContext pipeline is the retrieval-and-injection layer; and the model prompt is the working context.

### How other AI coding agents handle rules

- **Claude Code** uses a hierarchy of `CLAUDE.md` files (managed policy → user `~/.claude/CLAUDE.md` → project `CLAUDE.md` → local `CLAUDE.local.md`), plus an auto-memory directory per project under `~/.claude/projects/<project>/memory/`. It explicitly supports importing `AGENTS.md` into `CLAUDE.md` so multiple tools can share rules [Anthropic: How Claude remembers your project].
- **Aider** loads a user-supplied `CONVENTIONS.md` read-only into the chat and can be configured to always load it via `.aider.conf.yml` [Aider: Specifying coding conventions].
- **Cursor** supports project rules (`.cursorrules` / `.cursor/rules`) with path scoping [Cursor Docs: Rules].
- **GitHub Copilot** supports repo-wide `copilot-instructions.md`, path-specific `*.instructions.md`, and `AGENTS.md` files anywhere in the tree [GitHub Docs: Repository custom instructions].

The common pattern is: **global rules → project rules → path-scoped rules**, loaded in a deterministic order, with a mechanism to keep personal notes separate from shared project standards.

---

## 2. Three-Bucket Design

### Bucket A — Minimal (best-bang-buck)

Goal: stop CYF from colliding with OpenCode on the same machine, with the smallest possible diff.

| Concern | Change |
|---------|--------|
| **App namespace** | Change `const app = "opencode"` to `const app = "cyf"` in `packages/core/src/global.ts:9`. This single constant drives `~/.local/share/cyf/`, `~/.cache/cyf/`, `~/.config/cyf/`, `~/.local/state/cyf/`, and `/tmp/cyf`. |
| **Config path override** | Keep `Flag.CYF_CONFIG_DIR` working; it already overrides `global.config` at `packages/core/src/global.ts:63`. |
| **Database name** | Change `packages/core/src/database/database.ts:52-53` from `opencode.db` / `opencode-${channel}.db` to `cyf.db` / `cyf-${channel}.db`. |
| **Drizzle config** | Update the hardcoded path in `packages/core/drizzle.config.ts:8` from `/home/thdxr/.local/share/opencode/opencode.db` to the CYF data path. |
| **Config loader** | Keep `packages/cyf/src/config/config.ts:242, 246, 250-252, 398, 416-417` reading `opencode.json` / `opencode.jsonc` for now; the directory rename is what matters. |
| **Global rules** | `packages/cyf/src/session/instruction.ts:59` and `packages/core/src/instruction-context.ts:55` already read `path.join(global.config, "AGENTS.md")`; moving `global.config` to `~/.config/cyf` gives CYF its own global `AGENTS.md` automatically. |
| **Memories** | Move from `~/.config/opencode/memories/` to `~/.config/cyf/memories/` by deriving the path from `global.config`. |
| **Migration** | None. First CYF run after the change creates fresh directories; existing OpenCode data remains untouched. |
| **Coexistence** | Yes. `~/.config/opencode/` and `~/.config/cyf/` are separate trees; CYF and OpenCode can run side-by-side. |

**What Bucket A does *not* do:** rename internal Effect service tags, rename `.opencode` project directories, rename package-internal strings like the `opencode` User-Agent or provider headers, or migrate existing CYF history out of the old `opencode.db`.

---

### Bucket B — Pragmatic (recommended)

Goal: clean identity separation plus a one-time migration path for existing CYF users, without renaming every internal symbol.

Includes all of **Bucket A**, plus:

| Concern | Change |
|---------|--------|
| **Config filename** | In CYF-specific directories, prefer `cyf.json` / `cyf.jsonc`; keep reading `opencode.json` / `opencode.jsonc` as legacy fallbacks in `packages/cyf/src/config/config.ts:398, 416-417`. |
| **Schema URL** | Keep `https://opencode.ai/config.json` for compatibility, but also accept `https://cyf.ai/config.json` and write the CYF URL in newly generated config (`packages/cyf/src/config/config.ts:246`). |
| **Global rules fallback** | On first run, if `~/.config/cyf/` does not exist but `~/.config/opencode/` does, prompt/copy: `~/.config/opencode/AGENTS.md` → `~/.config/cyf/AGENTS.md`. Add a new flag `CYF_GLOBAL_RULES_SOURCE` to point at an alternate global rules directory. |
| **Memories seeding** | Copy `~/.config/opencode/memories/*.md` to `~/.config/cyf/memories/` on first run if the destination is empty. |
| **Database migration** | At `packages/core/src/database/database.ts`, if `CYF_DB` is unset and the new `cyf.db` does not exist but an old `opencode.db` is present in the same channel location, offer a one-time copy (`cyf.db` is a copy, not a move, so OpenCode remains usable). |
| **User-visible strings** | Update user-facing identifiers that leak into requests and logs: `packages/core/src/models-dev.ts:15` User-Agent, `packages/core/src/observability.ts:43-50` service/attribute names, `packages/core/src/tool/websearch.ts:233` User-Agent, provider headers in `packages/core/src/plugin/provider/{vercel,zenmux,llmgateway,nvidia,openrouter,kilo,cerebras,cloudflare-*,gitlab}.ts`, and the `customize-opencode` skill description in `packages/core/src/plugin/skill.ts:24-27`. |
| **Project directories** | Keep `.opencode` as the primary project config directory name for compatibility, but also recognize `.cyf` if present. Update `packages/cyf/src/config/paths.ts:29, 35` and `packages/cyf/src/cli/cmd/tui/config/tui.ts:221, 224, 227`. |
| **Global subdirs** | Move skills/commands/agents global discovery from `~/.config/opencode/{skills,commands,agents}` to `~/.config/cyf/{skills,commands,agents}`; keep the old paths as fallback. |
| **Migration command** | Add a CLI command or startup check (e.g., `cyf migrate` or an interactive first-run prompt) that performs the copy operations and writes a sentinel file `~/.config/cyf/.migrated-from-opencode`. |
| **Coexistence** | Yes. CYF reads/writes its own namespace; OpenCode continues unchanged. |

---

### Bucket C — Complete (best-par)

Goal: full identity separation down to internal service tags and project directory naming.

Includes all of **Bucket B**, plus:

| Concern | Change |
|---------|--------|
| **Effect service tags** | Rename every `@opencode/*` Context tag to `@cyf/*` across `packages/core/src/**/*.ts` and `packages/cyf/src/**/*.ts`. Examples: `packages/core/src/global.ts:44` `@opencode/Global` → `@cyf/Global`; `packages/core/src/database/database.ts:19` `@opencode/v2/storage/Database` → `@cyf/v2/storage/Database`; `packages/core/src/system-context/index.ts:28,41` symbols and TypeId. |
| **Project directory name** | Make `.cyf` the canonical project directory name; rename existing `.opencode` dirs automatically or via `cyf migrate`. Update `packages/core/src/project.ts:87, 146` project marker file from `opencode` to `cyf`. |
| **Binary/package identity** | Already done (`cyf` binary, `@cyf-ai/*` packages); finish remaining `opencode` strings in docs, READMEs, and install scripts. |
| **Internal file names** | Rename log dirs, bin dirs, repo cache keys, and lock files from `opencode-*` to `cyf-*`. |
| **Config loader** | Drop legacy `opencode.json` fallback after a deprecation window; only `cyf.json` / `cyf.jsonc` are recognized in CYF mode. |
| **Instruction context** | Extend `packages/core/src/instruction-context.ts` to load a CYF-specific global rules filename (e.g., `CYF.md` or `CLAUDE.md`) in addition to `AGENTS.md`, with explicit precedence: managed → user `~/.cyf/` → `~/.config/cyf/` → project `AGENTS.md` / `CYF.md` / `CLAUDE.md` → path-scoped `.cyf/rules/`. |
| **Chronicler / Bluume** | Make the chronicler namespace-aware: canonical posts about CYF decisions are tagged `cyf` and `canonical`; the MCP tools or a new `cyf memory` command read/write CYF-specific memory. |
| **Migration** | One-shot, idempotent `cyf migrate` command that copies data, config, memories, and renames `.opencode` → `.cyf` project directories. |
| **Coexistence** | Yes, by design. |

---

## 3. Core / Memories Interaction Design

### Principles

1. **Durable memory lives on disk; working context lives in the prompt.** Do not dump every memory file into every prompt. Use SystemContext to observe, diff, and emit baseline/update text only when the relevant memory changes.
2. **Hierarchical scope.** Global rules apply everywhere; project rules apply per directory tree; local rules apply per worktree/user.
3. **Identity-aware paths.** All paths derive from a single `appId` constant (`"cyf"`) so changing the app name changes the entire namespace consistently.
4. **Backward compatibility is opt-in, not default.** CYF should own `~/.config/cyf/` by default; reading from `~/.config/opencode/` is a migration-time or compatibility-mode behavior.

### Memory pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  Durable memory stores (disk)                                   │
│  ~/.config/cyf/AGENTS.md        (global rules)                  │
│  ~/.config/cyf/memories/*.md    (user memories / chronicler)    │
│  ./AGENTS.md                    (project rules)                 │
│  ./.cyf/rules/*.md              (path-scoped rules)             │
│  ./CYF.local.md                 (personal project notes)        │
└──────────────────────────────┬──────────────────────────────────┘
                               │  observed by
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  SystemContext registry (packages/core/src/system-context)      │
│  • InstructionContext.layer  → AGENTS.md tree                   │
│  • MemoryContext.layer       → memories/*.md                    │
│  • RulesContext.layer        → .cyf/rules/*.md                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │  reconciled per SessionContextEpoch
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Working prompt context                                         │
│  baseline on session start; updates when files change           │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation sketch

1. **Single source of truth for identity.**
   Add `const appId = "cyf"` in `packages/core/src/global.ts:9` and derive all XDG paths from it. Existing `Flag.CYF_CONFIG_DIR` continues to override `global.config`.

2. **SystemContext-based memory loader.**
   Create `packages/core/src/memory-context.ts` that mirrors `instruction-context.ts` but watches `~/.config/cyf/memories/`:
   - Load every `*.md` file sorted by filename.
   - Emit one SystemContext source keyed `core/memories`.
   - Use the same baseline/update/reconcile semantics as `SystemContext` (`packages/core/src/system-context/index.ts:194-280`).

3. **InstructionContext updates.**
   In `packages/core/src/instruction-context.ts:55`, replace the hardcoded `join(global.config, "AGENTS.md")` with a helper that returns the CYF global rules path. Add support for a CYF-specific filename (e.g., `CYF.md`) taking precedence over `AGENTS.md` when both exist.

4. **V1 compatibility shim.**
   Keep `packages/cyf/src/session/instruction.ts` functional, but make it read from the same `global.config` path. Consider making it a thin wrapper around the SystemContext-based loader to avoid divergent behavior.

5. **Bluume integration.**
   Add a CYF-specific MCP command or tool invocation (e.g., `cyf_memory_bank`) that can pull canonical posts tagged `cyf`/`canonical` into `~/.config/cyf/memories/` before session start, and push new chronicler notes back to Bluume at session end. This keeps Bluume as the durable source of truth while CYF owns the local cache.

6. **Migration sentinel.**
   Write `~/.config/cyf/.migrated-from-opencode` after a successful first-run migration so CYF does not repeatedly prompt. Store the migration version inside the sentinel for future migrations.

---

## 4. Recommendation and Rationale

**Recommended approach: implement Bucket B first, then incrementally move to Bucket C.**

### Why Bucket B over A

Bucket A fixes the collision but gives users a **cold start**: they lose their existing CYF sessions, global rules, and memories because CYF suddenly looks in `~/.config/cyf/` with no data. Bucket B adds a small, one-time migration layer that copies (not moves) the old OpenCode data into the CYF namespace. This preserves coexistence and avoids surprising users.

### Why not jump straight to Bucket C

Bucket C renames every internal Effect service tag (`@opencode/*` → `@cyf/*`) and every `.opencode` project directory. That is a large, high-risk refactor with no user-visible benefit beyond ideological purity. It also risks breaking third-party plugins or tests that match on service tags or directory names. The namespace problem that actually harms users is **external paths and database names**—exactly what Bucket B fixes.

### Suggested rollout order

1. **Land Bucket A as the immediate fix** (`global.ts:9`, `database.ts:52-53`, `drizzle.config.ts:8`) so CYF and OpenCode stop stepping on each other.
2. **Follow with Bucket B migration logic** (config/memories/DB copy, legacy filename fallbacks, user-visible string updates) so existing CYF users keep their state.
3. **Schedule Bucket C as a cleanup epic** after Bucket B has stabilized and tests confirm side-by-side OpenCode/CYF usage works.

### Open questions to resolve before implementation

- Should the migration be **automatic** on first run or gated behind an explicit `cyf migrate` command?
- Should CYF continue to honor `.opencode` project directories indefinitely, or deprecate them with a warning?
- Should global rules default to a **copy** of Ivan’s `~/.config/opencode/AGENTS.md`, or should CYF ship its own slimmer default and import the OpenCode rules only on request?

---

## References

- Wikipedia contributors, “LibreOffice,” *Wikipedia*, 2026. https://en.wikipedia.org/wiki/LibreOffice
- Wikipedia contributors, “MariaDB,” *Wikipedia*, 2026. https://en.wikipedia.org/wiki/MariaDB
- Wikipedia contributors, “Node.js,” *Wikipedia*, 2026. https://en.wikipedia.org/wiki/Node.js (Io.js section)
- freedesktop.org, “XDG Base Directory Specification.” https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html
- C. Packer et al., “MemGPT: Towards LLMs as Operating Systems,” arXiv:2310.08560, 2023.
- G. Wang et al., “Voyager: An Open-Ended Embodied Agent with Large Language Models,” arXiv:2305.16291, 2023.
- Anthropic, “How Claude remembers your project,” 2026. https://docs.anthropic.com/en/docs/claude-code/claude-md
- Aider, “Specifying coding conventions.” https://aider.chat/docs/usage/conventions.html
- Cursor, “Rules.” https://docs.cursor.com/context/rules
- GitHub Docs, “Adding repository custom instructions for GitHub Copilot.” https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot
