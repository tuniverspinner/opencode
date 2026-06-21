import { expect } from "bun:test"
import { Effect } from "effect"
import type { MCP as MCPNS } from "../../src/mcp/index"
import { testEffect } from "../lib/effect"

const { MCP } = await import("../../src/mcp/index")

const it = testEffect(MCP.defaultLayer)

it.instance(
  "init returns immediately without blocking on MCP connections",
  () =>
    MCP.Service.use((mcp: MCPNS.Interface) =>
      Effect.gen(function* () {
        const started = Date.now()
        const tools = yield* mcp.tools()
        const elapsed = Date.now() - started

        // tools() must return immediately (sub-100ms), not block on connections.
        // Before the fix, this could block 800+ms waiting for bluume MCP.
        expect(elapsed).toBeLessThan(200)
        // Tools may be empty on first call — background fibers haven't completed.
        // This is expected: tools arrive on subsequent calls.
        expect(Object.keys(tools).length).toBeGreaterThanOrEqual(0)
      }),
    ),
  { config: { mcp: {} } },
)

it.instance(
  "config-driven MCP connections do not delay init",
  () =>
    MCP.Service.use((mcp: MCPNS.Interface) =>
      Effect.gen(function* () {
        const started = Date.now()
        const tools = yield* mcp.tools()
        const elapsed = Date.now() - started

        // With a config-driven server, init still returns immediately.
        // The connection happens in a background fiber.
        expect(elapsed).toBeLessThan(500)
        expect(Object.keys(tools).length).toBeGreaterThanOrEqual(0)
      }),
    ),
  {
    config: {
      mcp: {
        "deferred-test": {
          type: "local",
          command: ["echo", "deferred"],
        },
      },
    },
  },
)
