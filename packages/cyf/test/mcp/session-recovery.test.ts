import path from "node:path"
import { describe, expect, test } from "bun:test"

// Skipped until @modelcontextprotocol/sdk is upgraded to 1.29.0+
// The session recovery patch targets 1.29.0 but CYF currently ships 1.27.1
describe.skip("mcp session recovery", () => {
  test("reinitializes and retries once after a session-bound POST returns 404", async () => {
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "../fixture/mcp-session-recovery.ts")], {
      cwd: path.join(import.meta.dir, "../.."),
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      Bun.readableStreamToText(child.stdout),
      Bun.readableStreamToText(child.stderr),
    ])

    expect(code, stderr).toBe(0)
    expect(JSON.parse(stdout)).toEqual([
      { method: "initialize", session: null },
      { method: "notifications/initialized", session: "expired" },
      { method: "ping", session: "expired" },
      { method: "initialize", session: null },
      { method: "notifications/initialized", session: "replacement" },
      { method: "ping", session: "replacement" },
    ])
  })
})
