import path from "node:path"
import { expect } from "bun:test"
import { Effect } from "effect"
import { MCP } from "../../src/mcp/index"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(MCP.defaultLayer)
const inherited = [
  "APPDATA",
  "HOME",
  "LANG",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "SYSTEMROOT",
  "TEMP",
  "TMPDIR",
  "USERPROFILE",
] as const

it.instance(
  "local subprocess receives only baseline and configured environment",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const previous = process.env.OPENCODE_MCP_PARENT_SECRET
      process.env.OPENCODE_MCP_PARENT_SECRET = "parent-secret"

      yield* MCP.Service.use((mcp) =>
        Effect.gen(function* () {
          const output = path.join(test.directory, "environment.json")
          const result = yield* mcp.add("environment", {
            type: "local",
            command: [process.execPath, path.join(import.meta.dir, "../fixture/mcp-environment.js")],
            environment: {
              MCP_ENV_OUTPUT: output,
              MCP_EXPLICIT_TOKEN: "configured-token",
              ...(process.platform === "win32" ? { Path: path.dirname(process.execPath) } : {}),
            },
          })

          if (!("environment" in result.status)) throw new Error("Expected MCP status map")
          expect(result.status.environment).toEqual({ status: "connected" })
          const env = (yield* Effect.promise(() => Bun.file(output).json())) as Record<string, string>
          expect(env.OPENCODE_MCP_PARENT_SECRET).toBeUndefined()
          expect(env.MCP_EXPLICIT_TOKEN).toBe("configured-token")
          inherited.forEach((key) => {
            if (process.platform === "win32" && key === "PATH") return
            if (process.env[key] !== undefined) expect(env[key]).toBe(process.env[key])
          })
          if (process.platform === "win32") {
            expect(Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1]).toBe(
              path.dirname(process.execPath),
            )
          }
        }).pipe(Effect.ensuring(mcp.disconnect("environment").pipe(Effect.ignore))),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (previous === undefined) delete process.env.OPENCODE_MCP_PARENT_SECRET
            else process.env.OPENCODE_MCP_PARENT_SECRET = previous
          }),
        ),
      )
    }),
  { config: { mcp: {} } },
)
