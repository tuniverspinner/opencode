# CYF — Command Your Fleet

Fork of `anomalyco/opencode` at tag **v1.16.2**. Everything renamed: `@opencode-ai/` → `@cyf-ai/`, `OPENCODE_*` → `CYF_*`, CLI binary `opencode` → `cyf`.

- Default branch: `dev`. Local `main` may not exist; use `dev` or `origin/dev` for diffs.
- To regenerate the JavaScript SDK: `./packages/sdk/js/script/build.ts`.

## Commits

Use conventional commit-style messages: `type(scope): summary`.

Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Scopes optional — use the affected package or area (`cyf`, `tui`, `core`, `sdk`, `plugin`).

## Build & Version

Always use the bump-v script — never invoke `build.ts` directly with manual `CYF_VERSION`:

```sh
bun run script/bump-v.ts 0.0.16--descriptor
# without git tag:
bun run script/bump-v.ts 0.0.16--descriptor --no-tag
# install as cyfd (dev binary, coexists with stable cyf):
bun run script/bump-v.ts 0.0.16--descriptor --no-tag --name cyfd
```

The script validates the version, tags (optional), builds, installs as a real file to `~/.local/bin/{name}`, and verifies. Defaults to `--single --skip-embed-web-ui` for local dev. Pass build flags to override.

Version format: `MAJOR.MINOR.PATCH--descriptor`. Descriptors are short, timeless labels. Never use dates in slugs. Never produce `0.0.0-` fingerprint versions — they are build garbage, not releases.

## TUI Dual-Path Architecture

CYF has two separate TUI code paths. Do not conflate them:

| | Path A: `cyf` (no args) | Path B: `cyf run --interactive` |
|---|---|---|
| Entry | `thread.ts` → `prepare-tui-session.ts` → `app.tsx` | `run.ts` → `runtime.ts` → `runtime.lifecycle.ts` |
| TTFD | `<TimeToFirstDraw />` from `@opentui/solid` | `performance.now()` at `runtime.ts:439` |
| Used by | Daily driver (hot path) | Not used in normal flow |

**All TTFD work targets Path A.** Path B has its own `renderer.idle()` call and TTFD measurement that are irrelevant to the daily driver.

## Provider Tree & Rendering Gates

The provider tree in `app.tsx:mountTui()` is 13 levels deep. Providers created via `createSimpleContext` (`context/helper.tsx`) used to gate children behind `<Show when={init.ready}>`. **The gate was removed** — providers always render children immediately. `ready` fields remain as queryable signals for business logic (plugins, auto-submit gating), not rendering gates.

For the full provider audit (which providers block, which are async, which are sync), see `bluume://cyf-tui-provider-architecture-audit`.

## Boot Trace / Trailmarks

Env-gated trace points throughout the boot path. Zero behavior change when disabled.

```sh
CYF_BOOT_TRACE=1 CYF_SHOW_TTFD=1 CYF_BOOT_TRACE_FILE=/tmp/cyf-trace.txt cyf
```

Produces 26 trailmarks from `index.ts module body start` through `TUI: TTFD (real terminal paint)`. Includes per-provider gates (`ProviderGate` components wrap KVProvider, SyncProvider, ThemeProvider).

## Key Bridge

Keys are loaded via `~/.local/bin/load-keys` (24h cache, `--force` to refresh). See `bluume://key-bridge-architecture`.

## Style Guide

### General Principles

- Keep things in one function unless composable or reusable
- Do not extract single-use helpers preemptively. Inline at the call site unless the helper is reused, hides a genuinely complex boundary, or has a clear independent name.
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference; avoid explicit type annotations unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream

Reduce total variable count by inlining when a value is only used once.

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation to preserve context.

### Imports

- Never alias imports. No `import { foo as bar }`.
- Never use star imports. No `import * as Foo`.
- If a namespace-style value is needed, import the module's own exported namespace: `import { Project } from "@cyf-ai/core/project"`, then `Project.ID`.
- Prefer dynamic imports for heavy modules only needed in selected code paths, especially in startup-sensitive entrypoints. Destructure dynamic import bindings near the top of the narrowest scope. Avoid inline chains like `await import("./module").then((mod) => mod.value())`.

### Variables

Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.

### Control Flow

Avoid `else` statements. Prefer early returns.

### Complex Logic

Make the main function read as the happy path. Move supporting details into small helpers below it. Don't over-abstract simple expressions — extract only when it names a real concept.

- Do not return `Effect` from helpers unless they actually perform effectful work. Synchronous parsing, validation, and option building should stay synchronous.
- Prefer Effect schema helpers (`Schema.UnknownFromJsonString`, `Schema.decodeUnknownOption`) over manual `JSON.parse` wrapped in `Effect.try`.
- Comments for non-obvious constraints and surprising behavior only.

### Schema Definitions (Drizzle)

Use snake_case for field names so column names don't need redefining as strings.

## Testing

- Avoid mocks as much as possible
- Test actual implementation, do not duplicate logic into tests
- Tests cannot run from repo root; run from package dirs like `packages/cyf`

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `packages/cyf`), never `tsc` directly.
