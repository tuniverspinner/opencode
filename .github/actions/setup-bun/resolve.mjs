import fs from "node:fs"
import path from "node:path"
const exact = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function output(name, value) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

const config = JSON.parse(fs.readFileSync(path.join(process.env.GITHUB_WORKSPACE, "bun-versions.json"), "utf8"))
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
const target = process.env.GITHUB_BASE_REF || process.env.GITHUB_REF_NAME
const release =
  process.env.GITHUB_WORKFLOW === "publish" &&
  (event.inputs?.bump || (event.inputs?.version && !event.inputs.version.startsWith("0.0.0-")))
const channel = process.env.GITHUB_WORKFLOW === "beta" ? "beta" : release ? "prod" : target === "beta" ? "beta" : "dev"
const selector = config[channel]

if (!selector) throw new Error(`Unknown Bun channel: ${channel}`)
if (selector !== "canary" && !exact.test(selector)) throw new Error(`Invalid Bun selector for ${channel}: ${selector}`)

output("selector", selector)
output("tag", selector === "canary" ? "canary" : `bun-v${selector}`)
