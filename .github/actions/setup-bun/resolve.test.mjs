import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { resolve } from "./resolve.mjs"

const config = {
  dev: "1.3.14",
  beta: "canary",
  prod: "1.3.14",
}

test("uses an explicit release channel", () => {
  assert.deepEqual(resolve(config, { channel: "prod", ref: "beta" }), {
    channel: "prod",
    selector: "1.3.14",
  })
})

test("uses the PR target branch", () => {
  assert.deepEqual(resolve(config, { base: "beta", ref: "123/merge" }), {
    channel: "beta",
    selector: "canary",
  })
})

test("uses the pushed branch", () => {
  assert.deepEqual(resolve(config, { ref: "beta" }), {
    channel: "beta",
    selector: "canary",
  })
})

test("defaults non-release events and branches to dev", () => {
  assert.deepEqual(resolve(config, { ref: "feature/example" }), {
    channel: "dev",
    selector: "1.3.14",
  })
})

test("accepts exact prerelease selectors", () => {
  assert.equal(resolve({ ...config, beta: "1.4.0-beta.1" }, { ref: "beta" }).selector, "1.4.0-beta.1")
})

test("rejects moving selectors other than canary", () => {
  assert.throws(() => resolve({ ...config, beta: "latest" }, { ref: "beta" }), /Invalid Bun selector/)
})

test("rejects unknown explicit channels", () => {
  assert.throws(() => resolve(config, { channel: "preview" }), /Unknown Bun channel/)
})

test("keeps the local package manager on the dev toolchain", () => {
  const root = new URL("../../../", import.meta.url)
  const configured = JSON.parse(fs.readFileSync(new URL("bun-versions.json", root), "utf8"))
  const pkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"))
  assert.equal(pkg.packageManager, `bun@${configured.dev}`)
})
