import { expect, test } from "bun:test"
import { setTimeout as sleep } from "node:timers/promises"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"
import { McpAuth } from "../../src/mcp/auth"
import { McpOAuthProvider } from "../../src/mcp/oauth-provider"

function authFile() {
  let raw = ""
  let activeWrites = 0
  let sawOverlap = false

  const layer = Layer.effect(
    FSUtil.Service,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service

      return FSUtil.Service.of({
        ...fs,
        readJson: (file) =>
          file.endsWith("mcp-auth.json")
            ? Effect.try({
                try: () => {
                  if (!raw) throw new Error("mcp-auth.json missing")
                  return JSON.parse(raw)
                },
                catch: (cause) => new FSUtil.FileSystemError({ method: "readJson", cause }),
              })
            : fs.readJson(file),
        writeJson: (file, value, mode) =>
          file.endsWith("mcp-auth.json")
            ? Effect.promise(async () => {
                activeWrites++
                sawOverlap = sawOverlap || activeWrites > 1
                raw = ""
                await sleep(10)
                const next = JSON.stringify(value, null, 2)
                raw = sawOverlap ? `${next}\n}` : next
                activeWrites--
              })
            : fs.writeJson(file, value, mode),
      })
    }),
  ).pipe(Layer.provide(FSUtil.defaultLayer))

  return { layer, raw: () => raw }
}

function authService(layer: Layer.Layer<FSUtil.Service>) {
  return McpAuth.Service.use((auth) => Effect.succeed(auth)).pipe(
    Effect.provide(McpAuth.layer.pipe(Layer.provide(EffectFlock.defaultLayer), Layer.provide(layer))),
  )
}

function gateCredentialInvalidation(
  auth: McpAuth.Interface,
  ready: Deferred.Deferred<void>,
  release: Deferred.Deferred<void>,
) {
  const gate = Deferred.succeed(ready, undefined).pipe(Effect.ignore, Effect.andThen(Deferred.await(release)))
  return McpAuth.Service.of({
    ...auth,
    invalidateCredentials: (mcpName, type, expected) =>
      gate.pipe(Effect.andThen(auth.invalidateCredentials(mcpName, type, expected))),
  })
}

test("serializes concurrent auth file updates across service instances", async () => {
  const file = authFile()

  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* authService(file.layer)
      const second = yield* authService(file.layer)

      yield* Effect.all(
        [
          first.updateTokens("posthog", { accessToken: "access-token" }, "https://mcp.posthog.com/mcp"),
          second.updateClientInfo("posthog", { clientId: "client-id" }, "https://mcp.posthog.com/mcp"),
        ],
        { concurrency: "unbounded" },
      )

      const entry = yield* first.get("posthog")
      expect(entry?.tokens?.accessToken).toBe("access-token")
      expect(entry?.clientInfo?.clientId).toBe("client-id")
      expect(entry?.serverUrl).toBe("https://mcp.posthog.com/mcp")
      expect(() => JSON.parse(file.raw())).not.toThrow()
    }),
  )
})

test("stale token invalidation does not delete newer tokens", async () => {
  const name = `token-invalidation-${crypto.randomUUID()}`
  const url = "https://mcp.example.com/exact/path"

  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* McpAuth.Service
      const second = yield* authService(FSUtil.defaultLayer)
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const provider = new McpOAuthProvider(
        name,
        url,
        {},
        { onRedirect: async () => {} },
        gateCredentialInvalidation(first, ready, release),
      )

      yield* first.updateTokens(name, { accessToken: "old-token" }, url)
      yield* Effect.promise(() => provider.tokens())
      const invalidation = yield* Effect.promise(() => provider.invalidateCredentials("tokens")).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      yield* second.updateTokens(name, { accessToken: "new-token" }, url)
      yield* Deferred.succeed(release, undefined).pipe(Effect.ignore)
      yield* Fiber.join(invalidation)

      const entry = yield* first.get(name)
      expect(entry?.tokens?.accessToken).toBe("new-token")
      expect(entry?.serverUrl).toBe(url)
      yield* first.remove(name)
    }).pipe(Effect.provide(McpAuth.defaultLayer)),
  )
})

test("stale client invalidation does not delete newer registration", async () => {
  const name = `client-invalidation-${crypto.randomUUID()}`
  const url = "https://mcp.example.com/exact/path"

  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* McpAuth.Service
      const second = yield* authService(FSUtil.defaultLayer)
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const provider = new McpOAuthProvider(
        name,
        url,
        {},
        { onRedirect: async () => {} },
        gateCredentialInvalidation(first, ready, release),
      )

      yield* first.updateClientInfo(name, { clientId: "old-client" }, url)
      yield* Effect.promise(() => provider.clientInformation())
      const invalidation = yield* Effect.promise(() => provider.invalidateCredentials("client")).pipe(Effect.forkChild)
      yield* Deferred.await(ready)
      yield* second.updateClientInfo(name, { clientId: "new-client" }, url)
      yield* Deferred.succeed(release, undefined).pipe(Effect.ignore)
      yield* Fiber.join(invalidation)

      const entry = yield* first.get(name)
      expect(entry?.clientInfo?.clientId).toBe("new-client")
      expect(entry?.serverUrl).toBe(url)
      yield* first.remove(name)
    }).pipe(Effect.provide(McpAuth.defaultLayer)),
  )
})
