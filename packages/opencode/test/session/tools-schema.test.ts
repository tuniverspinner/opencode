import { describe, expect } from "bun:test"
import { jsonSchema } from "ai"
import { Effect, Exit, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { ProjectID } from "@/project/schema"
import { ModelID, ProviderID } from "@/provider/schema"
import type { Provider } from "@/provider/provider"
import { SessionTools } from "@/session/tools"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, SessionID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Plugin } from "@/plugin"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    Layer.succeed(
      ToolRegistry.Service,
      ToolRegistry.Service.of({
        ids: () => Effect.succeed([]),
        all: () => Effect.succeed([]),
        named: () => Effect.die("unexpected named tool lookup"),
        tools: () => Effect.succeed([]),
      }),
    ),
    Layer.succeed(
      MCP.Service,
      MCP.Service.of({
        status: () => Effect.succeed({}),
        clients: () => Effect.succeed({}),
        tools: () =>
          Effect.succeed({
            ctx_batch_execute: {
              description: "context tool",
              inputSchema: jsonSchema({
                type: "object",
                properties: {
                  batch: {
                    type: "array",
                    items: schemaWithZodInternals(),
                  },
                },
              }),
              execute: () => Promise.resolve({ content: [{ type: "text" as const, text: "ok" }] }),
            },
          }),
        prompts: () => Effect.succeed({}),
        resources: () => Effect.succeed({}),
        add: () => Effect.succeed({ status: { status: "disabled" as const } }),
        connect: () => Effect.void,
        disconnect: () => Effect.void,
        getPrompt: () => Effect.succeed(undefined),
        readResource: () => Effect.succeed(undefined),
        startAuth: () => Effect.die("unexpected MCP auth"),
        authenticate: () => Effect.die("unexpected MCP auth"),
        finishAuth: () => Effect.die("unexpected MCP auth"),
        removeAuth: () => Effect.void,
        supportsOAuth: () => Effect.succeed(false),
        hasStoredTokens: () => Effect.succeed(false),
        getAuthStatus: () => Effect.succeed("not_authenticated" as const),
      }),
    ),
    Layer.succeed(
      Plugin.Service,
      Plugin.Service.of({
        trigger: (_name, _input, output) => Effect.succeed(output),
        list: () => Effect.succeed([]),
        init: () => Effect.void,
      }),
    ),
    Layer.succeed(
      Permission.Service,
      Permission.Service.of({
        ask: () => Effect.void,
        reply: () => Effect.void,
        list: () => Effect.succeed([]),
      }),
    ),
    Layer.succeed(
      Truncate.Service,
      Truncate.Service.of({
        cleanup: () => Effect.void,
        write: () => Effect.succeed("/tmp/tool-output"),
        output: (text) => Effect.succeed({ content: text, truncated: false as const }),
        limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
      }),
    ),
  ),
)

describe("SessionTools.resolve", () => {
  it.effect("fails locally when MCP schemas contain Zod internals", () =>
    Effect.gen(function* () {
      const exit = yield* SessionTools.resolve({
        agent: agentInfo(),
        model: kimiModel(),
        session: sessionInfo(),
        processor: processor(),
        bypassAgentCheck: false,
        messages: [],
        promptOps: promptOps(),
      }).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) return

      expect(String(exit.cause)).toContain("ctx_batch_execute")
      expect(String(exit.cause)).toContain("non-JSON-Schema Zod internals")
      expect(String(exit.cause)).toContain("$.properties.batch.items._zod")
    }),
  )
})

function agentInfo(): Agent.Info {
  return {
    name: "build",
    mode: "primary",
    permission: [],
    options: {},
  }
}

function schemaWithZodInternals() {
  return JSON.parse(
    JSON.stringify({
      _zod: { def: { type: "object" } },
      def: { type: "object" },
      typeName: "ZodObject",
      "~standard": { vendor: "zod" },
    }),
  )
}

function kimiModel(): Provider.Model {
  return {
    id: ModelID.make("kimi-k2.6"),
    providerID: ProviderID.make("moonshotai"),
    name: "Kimi K2.6",
    limit: { context: 128_000, output: 32_000 },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: {
      toolcall: true,
      attachment: false,
      reasoning: false,
      temperature: true,
      input: { text: true, image: false, audio: false, video: false, pdf: false },
      output: { text: true, image: false, audio: false, video: false, pdf: false },
      interleaved: false,
    },
    api: { id: "kimi-k2.6", url: "https://api.moonshot.example/v1", npm: "@ai-sdk/openai-compatible" },
    options: {},
    headers: {},
    release_date: "2026-01-01",
    status: "active",
  }
}

function sessionInfo() {
  return {
    id: SessionID.descending(),
    slug: "test",
    projectID: ProjectID.global,
    directory: "/tmp/test",
    title: "test",
    version: "test",
    time: { created: Date.now(), updated: Date.now() },
  }
}

function processor() {
  return {
    message: {
      id: MessageID.ascending(),
      sessionID: SessionID.descending(),
      role: "assistant",
      parentID: MessageID.ascending(),
      modelID: ModelID.make("kimi-k2.6"),
      providerID: ProviderID.make("moonshotai"),
      mode: "build",
      agent: "build",
      path: { cwd: "/tmp/test", root: "/tmp/test" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.now() },
    } satisfies MessageV2.Assistant,
    updateToolCall: () => Effect.succeed(undefined),
    completeToolCall: () => Effect.void,
  }
}

function promptOps() {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template: string) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: () => Effect.die("unexpected prompt call"),
    loop: () => Effect.die("unexpected loop call"),
  }
}
