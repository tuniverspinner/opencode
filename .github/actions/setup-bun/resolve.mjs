import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

export function resolve(config, input) {
  const inferred = input.base || input.ref
  const channel = input.channel || (inferred === "beta" ? "beta" : inferred === "prod" ? "prod" : "dev")
  const selector = config[channel]
  if (!selector) throw new Error(`Unknown Bun channel: ${channel}`)
  if (selector !== "canary" && !exact.test(selector))
    throw new Error(`Invalid Bun selector for ${channel}: ${selector}`)
  return { channel, selector }
}

function output(name, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(fs.readFileSync(path.join(process.env.GITHUB_WORKSPACE, "bun-versions.json"), "utf8"))
  const result = resolve(config, {
    channel: process.env.INPUT_CHANNEL,
    base: process.env.GITHUB_BASE_REF,
    ref: process.env.GITHUB_REF_NAME,
  })
  output("channel", result.channel)
  output("selector", result.selector)
  output("tag", result.selector === "canary" ? "canary" : `bun-v${result.selector}`)
}
