import readline from "node:readline"
import { writeFile } from "node:fs/promises"

await writeFile(process.env.MCP_ENV_OUTPUT, JSON.stringify(process.env))

const lines = readline.createInterface({ input: process.stdin })
lines.on("close", () => process.exit(0))
lines.on("line", (line) => {
  const request = JSON.parse(line)
  if (request.method !== "initialize") return
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        protocolVersion: request.params?.protocolVersion,
        capabilities: {},
        serverInfo: { name: "environment-test", version: "1" },
      },
    })}\n`,
  )
})
