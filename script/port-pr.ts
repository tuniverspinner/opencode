#!/usr/bin/env bun

import { parseArgs } from "util"
import { $ } from "bun"
import os from "node:os"
import path from "node:path"
import { readFile, writeFile, unlink } from "node:fs/promises"

const rawMap = JSON.parse(
  await readFile(new URL("port-map.json", import.meta.url), "utf-8"),
)

const requiredKeys = [
  "pathTransforms",
  "contentTransforms",
  "fileNameTransforms",
  "skipFiles",
  "skipPatterns",
  "skipCommitPatterns",
  "binaryExtensions",
]
for (const key of requiredKeys) {
  if (!(key in rawMap)) {
    console.error(`Error: port-map.json missing required key: ${key}`)
    process.exit(1)
  }
}

const map = rawMap as {
  pathTransforms: [string, string][]
  contentTransforms: [string, string][]
  fileNameTransforms: [string, string][]
  skipFiles: string[]
  skipPatterns: string[]
  skipCommitPatterns: string[]
  binaryExtensions: string[]
}

function printHelp() {
  console.log(`\
Usage: bun run script/port-pr.ts <pr-number|commit-hash> [options]

Port an upstream PR or commit from anomalyco/opencode into the CYF fork.
Applies path transforms (packages/opencode/ → packages/cyf/) and content
transforms (@opencode-ai/ → @cyf-ai/, OPENCODE_ → CYF_).

Options:
  --dry-run   Validate only (uses git apply --check)
  --force     Skip already-applied check
  --verbose   Show transforms per file
  --help      Show this help message

Examples:
  bun run script/port-pr.ts 31245              # apply PR #31245
  bun run script/port-pr.ts 31245 --dry-run    # validate only
  bun run script/port-pr.ts abc123def          # cherry-pick commit hash\
`)
}

async function isAlreadyApplied(target: string): Promise<boolean> {
  const result =
    await $`git log --oneline --grep ${target}`.quiet().nothrow()
  return result.stdout.toString().trim().length > 0
}

async function fetchPRPatch(pr: string): Promise<string> {
  const response = await fetch(
    `https://github.com/anomalyco/opencode/pull/${pr}.patch`,
    { signal: AbortSignal.timeout(30000) },
  )
  if (!response.ok) {
    console.error(
      `Error: GitHub returned ${response.status} ${response.statusText}`,
    )
    process.exit(1)
  }
  return response.text()
}

async function fetchCommitPatch(hash: string): Promise<string> {
  await $`timeout 30 git fetch https://github.com/anomalyco/opencode.git ${hash} --no-tags`.quiet().nothrow()

  const parents = (
    await $`git log -1 --format=%P ${hash}`.quiet()
  ).stdout
    .toString()
    .trim()

  if (!parents) {
    console.error(`Error: commit ${hash} not found after fetch`)
    process.exit(1)
  }

  const parent = parents.split(" ")[0]
  const diff = await $`git diff ${parent}..${hash}`.quiet()
  const raw = diff.stdout.toString()
  if (!raw.includes("diff --git")) {
    console.error("Error: git diff produced no usable patch")
    process.exit(1)
  }
  return raw
}

function applyTransforms(text: string): string {
  let result = text
  for (const [from, to] of map.pathTransforms) result = result.replaceAll(from, to)
  for (const [from, to] of map.contentTransforms) result = result.replaceAll(from, to)
  return result
}

/**
 * Apply fileNameTransforms to the basename component only.
 * For directories, the path parts are left alone (pathTransforms handle those).
 * For /dev/null, returns as-is.
 */
function transformBasename(filePath: string): string {
  const dir = path.dirname(filePath)
  let base = path.basename(filePath)
  for (const [from, to] of map.fileNameTransforms) base = base.replaceAll(from, to)
  return path.join(dir, base)
}

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return map.binaryExtensions.includes(ext)
}

function shouldSkipFile(filePath: string): string | null {
  const base = path.basename(filePath)
  if (map.skipFiles.includes(base)) return `skip list: ${base}`
  for (const pattern of map.skipPatterns) {
    if (new RegExp(pattern).test(filePath)) return `matches pattern: ${pattern}`
  }
  return null
}

function extractBPath(segment: string): string | null {
  const match = segment.match(/^diff --git a\/.*? b\/(.+)$/m)
  if (!match) return null
  return match[1].split(" ")[0]
}

/**
 * Transform header lines in a diff segment to remap file paths.
 * Handles: diff --git, ---, +++, rename from/to, copy from/to.
 * Leaves /dev/null untouched.
 */
function transformSegmentHeader(header: string): string {
  let result = header
  const lines = [
    { regex: /^(diff --git) a\/(.+) b\/(.+)$/m, aGroup: 2, bGroup: 3, fmt: (a: string, b: string) => `diff --git a/${a} b/${b}` },
    { regex: /^(---) a\/(.+)$/m, aGroup: 2, fmt: (a: string) => `--- a/${a}` },
    { regex: /^(\+\+\+) b\/(.+)$/m, aGroup: 2, fmt: (a: string) => `+++ b/${a}` },
    { regex: /^(rename from) (.+)$/m, aGroup: 2, fmt: (a: string) => `rename from ${a}` },
    { regex: /^(rename to) (.+)$/m, aGroup: 2, fmt: (a: string) => `rename to ${a}` },
    { regex: /^(copy from) (.+)$/m, aGroup: 2, fmt: (a: string) => `copy from ${a}` },
    { regex: /^(copy to) (.+)$/m, aGroup: 2, fmt: (a: string) => `copy to ${a}` },
  ]

  for (const { regex, aGroup, bGroup, fmt } of lines) {
    result = result.replace(regex, (...args: string[]) => {
      const a = transformBasename(args[aGroup] ?? "")
      if (bGroup !== undefined) {
        const b = transformBasename(args[bGroup] ?? "")
        return fmt(a, b)
      }
      return fmt(a)
    })
  }

  return result
}

interface SegmentResult {
  text: string | null
  skipped: boolean
  reason?: string
  originalFile: string
  transformedFile?: string
}

function transformSegment(
  segment: string,
  verbose: boolean,
): SegmentResult {
  const originalFile = extractBPath(segment)
  if (!originalFile)
    return {
      text: null,
      skipped: true,
      reason: "could not extract file path",
      originalFile: "unknown",
    }

  const skipReason = shouldSkipFile(originalFile)
  if (skipReason)
    return {
      text: null,
      skipped: true,
      reason: skipReason,
      originalFile,
    }

  if (isBinaryFile(originalFile))
    return {
      text: null,
      skipped: true,
      reason: "binary file",
      originalFile,
    }

  let transformed = applyTransforms(segment)
  transformed = transformSegmentHeader(transformed)

  const transformedFile = extractBPath(transformed)

  if (verbose)
    console.log(
      `  [transform] ${originalFile} → ${transformedFile ?? originalFile}`,
    )

  return {
    text: transformed,
    skipped: false,
    originalFile,
    transformedFile: transformedFile ?? originalFile,
  }
}

function parseSegments(patchText: string): string[] {
  const parts = patchText.split(/\n(?=diff --git )/)
  return parts.filter((s) => s.startsWith("diff --git "))
}

function countSkippedCommits(patchText: string): number {
  const subjects = [
    ...patchText.matchAll(/^Subject: \[PATCH.*?\] (.*)$/gm),
  ].map((m) => m[1])
  let skipped = 0
  for (const subj of subjects) {
    for (const pattern of map.skipCommitPatterns) {
      if (new RegExp(pattern).test(subj)) {
        skipped++
        break
      }
    }
  }
  return skipped
}

async function gitRootOrExit(): Promise<string> {
  process.chdir(import.meta.dir)
  const result = await $`git rev-parse --show-toplevel`.quiet().nothrow()
  const root = result.stdout.toString().trim()
  if (result.exitCode !== 0 || !root) {
    console.error("Error: cannot find git repository root")
    process.exit(1)
  }
  return root
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  })

  if (values.help || positionals.length === 0) {
    printHelp()
    process.exit(values.help ? 0 : 1)
  }

  const repoRoot = await gitRootOrExit()
  process.chdir(repoRoot)

  const target = positionals[0]

  if (/[^a-zA-Z0-9]/.test(target)) {
    console.error("Error: target contains invalid characters")
    process.exit(1)
  }

  const isPr = /^\d{1,6}$/.test(target)
  const isHash = /^[a-fA-F0-9]{7,40}$/.test(target)

  if (!isPr && !isHash) {
    console.error("Error: target must be a PR number (1-6 digits) or a commit hash (7-40 hex characters)")
    process.exit(1)
  }

  if (!values.force) {
    const applied = await isAlreadyApplied(target)
    if (applied) {
      console.log(
        `Target ${target} appears already applied (found in git log). Use --force to override.`,
      )
      process.exit(0)
    }
  }

  const verb = values["dry-run"] ? "Validating" : "Porting"

  let patchText: string
  if (isPr) {
    console.log(`${verb} PR #${target} from anomalyco/opencode...`)
    patchText = await fetchPRPatch(target)
  } else {
    console.log(`${verb} commit ${target.slice(0, 8)} from upstream...`)
    patchText = await fetchCommitPatch(target)
  }

  if (!patchText.trim()) {
    console.error("Error: empty patch (no changes to port)")
    process.exit(1)
  }

  const segments = parseSegments(patchText)
  if (segments.length === 0) {
    console.error("Error: no diff segments found in patch")
    process.exit(1)
  }

  let skippedCount = 0
  let binaryCount = 0
  let appliedCount = 0
  const results: SegmentResult[] = []

  console.log(`\n${segments.length} file(s) in patch:`)
  for (const seg of segments) {
    const result = transformSegment(seg, values.verbose ?? false)
    results.push(result)
    if (result.skipped) {
      skippedCount++
      if (result.reason) console.log(`  [skip]  ${result.originalFile} — ${result.reason}`)
      if (result.reason === "binary file") binaryCount++
    } else {
      appliedCount++
      console.log(`  [port]  ${result.originalFile}`)
    }
  }

  const commitSkips = countSkippedCommits(patchText)
  if (commitSkips > 0)
    console.log(`\n${commitSkips} commit(s) skipped by skipCommitPatterns`)

  const transformedParts = results
    .filter((r) => !r.skipped && r.text)
    .map((r) => r.text!)

  if (transformedParts.length === 0) {
    console.log(
      `\nNo files to apply (all ${skippedCount} file(s) skipped).`,
    )
    process.exit(0)
  }

  const transformedPatch = transformedParts.join("\n")
  const tempPath = path.join(os.tmpdir(), `port-pr-${target}.patch`)

  try {
    await writeFile(tempPath, transformedPatch, "utf-8")

    if (values["dry-run"]) {
      console.log(`\nRunning git apply --check...`)
      const result =
        await $`git apply --check ${tempPath}`.quiet().nothrow()
      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString().trim()
        console.log(`\n--- git apply --check stderr ---`)
        console.log(stderr)
        console.log(`--- end ---`)
        console.log(`\nFAILED — patch does not apply cleanly.`)
        throw new Error("patch does not apply cleanly")
      }
      console.log(`  OK — ${appliedCount} file(s) would apply cleanly.`)
    } else {
      console.log(`\nApplying with git apply --3way...`)
      const result =
        await $`git apply --3way ${tempPath}`.quiet().nothrow()
      const stderr = result.stderr.toString().trim()
      if (result.exitCode !== 0) {
        console.log(`\n--- git apply --3way stderr ---`)
        console.log(stderr)
        console.log(`--- end ---`)
        console.log(`\nFAILED — patch could not be applied.`)
        throw new Error("patch could not be applied")
      }
      if (stderr) console.log(`  ${stderr}`)
      console.log(`  OK — ${appliedCount} file(s) ported.`)
    }

    console.log(`\n--- Summary ---`)
    console.log(`Ported:    ${appliedCount}`)
    console.log(`Skipped:   ${skippedCount}`)
    if (binaryCount > 0) console.log(`  (binary: ${binaryCount})`)
  } finally {
    unlink(tempPath).catch(() => {})
  }
}

main().catch((err) => {
  console.error("Error:", (err as Error).message ?? err)
  process.exit(1)
})
