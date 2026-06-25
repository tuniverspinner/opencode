#!/usr/bin/env bun
//
// bump-v.ts — Version in, build out. All versioning handled inside.
//
// Usage:
//   bun run script/bump-v.ts 0.0.16--descriptor          # tag + build + verify
//   bun run script/bump-v.ts 0.0.16--descriptor --no-tag  # build without git tag
//
// Build flags pass through:
//   bun run script/bump-v.ts 0.0.16--descriptor --single --skip-embed-web-ui
//
// Defaults to --single --skip-embed-web-ui if no build flags given.

import { $, argv } from "bun"

const args = argv.slice(2)

if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
  console.log(`bump-v — version in, build out

Usage:
  bun run script/bump-v.ts <version> [build flags...]

Examples:
  bun run script/bump-v.ts 0.0.16--return-to-beauty
  bun run script/bump-v.ts 0.0.16--return-to-beauty --no-tag
  bun run script/bump-v.ts 0.0.17--island-arch --single

Version format: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH--descriptor
Descriptor is a short, timeless label (no dates).`)
  process.exit(0)
}

const version = args[0]
const buildArgs = args.slice(1)

// Validate
if (!/^\d+\.\d+\.\d+(--[a-z0-9-]+)?$/.test(version)) {
  console.error(`✗ Invalid version: "${version}"`)
  console.error(`  Expected: MAJOR.MINOR.PATCH or MAJOR.MINOR.PATCH--descriptor`)
  console.error(`  Example: 0.0.16--return-to-beauty`)
  process.exit(1)
}

// Hard rule — never produce a fingerprint
if (version.startsWith("0.0.0-")) {
  console.error(`✗ Refusing to bump to a fingerprint version: ${version}`)
  console.error(`  Use a real version. Fingerprints are for ad-hoc dev only.`)
  process.exit(1)
}

const tagFlag = buildArgs.includes("--no-tag")
const realBuildArgs = buildArgs.filter((f) => f !== "--no-tag")
const finalBuildArgs = realBuildArgs.length === 0
  ? ["--single", "--skip-embed-web-ui"]
  : realBuildArgs

// 1. Tag (unless --no-tag)
if (!tagFlag) {
  try {
    await $`git tag ${version}`.quiet()
    console.log(`✓ Tagged ${version}`)
  } catch {
    const existing = await $`git tag -l ${version}`.text()
    if (existing.trim() === version) {
      console.log(`- Tag ${version} already exists, continuing`)
    } else {
      console.error(`✗ Failed to tag ${version}`)
      process.exit(1)
    }
  }
}

// 2. Build — CYF_VERSION set so @cyf-ai/script uses it verbatim
console.log(`Building ${version}...`)
await $`CYF_VERSION=${version} bun run script/build.ts ${finalBuildArgs}`.cwd(process.cwd())

// 3. Verify
const result = await $`cyf --version`.text()
const installed = result.trim()
if (installed === version) {
  console.log(`✓ Installed: ${installed}`)
} else {
  console.error(`✗ Version mismatch: expected ${version}, got ${installed}`)
  process.exit(1)
}

console.log(`Done. ${version} is live.`)
