import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "@/lsp/lsp"
import { Snapshot } from "../snapshot"
import * as Project from "./project"
import * as Vcs from "./vcs"
import { InstanceState } from "@/effect/instance-state"
import { ShareNext } from "@/share/share-next"
import { Effect, Layer } from "effect"
import { Config } from "@/config/config"
import { bootProfile } from "@/util/boot-trace"
import { Service } from "./bootstrap-service"
import { Reference } from "@/reference/reference"

export { Service } from "./bootstrap-service"
export type { Interface } from "./bootstrap-service"

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Yield each bootstrap dep at layer init so `run` itself has R = never.
    // InstanceStore imports only the lightweight tag from bootstrap-service.ts,
    // so it can depend on bootstrap without importing this implementation graph.
    const config = yield* Config.Service
    const format = yield* Format.Service
    const lsp = yield* LSP.Service
    const plugin = yield* Plugin.Service
    const project = yield* Project.Service
    const reference = yield* Reference.Service
    const shareNext = yield* ShareNext.Service
    const snapshot = yield* Snapshot.Service
    const vcs = yield* Vcs.Service

    const run = Effect.gen(function* () {
      const ctx = yield* InstanceState.context
      yield* Effect.logInfo("bootstrapping").pipe(Effect.annotateLogs("directory", ctx.directory))
      // everything depends on config so eager load it for nice traces
      const cfgStart = performance.now()
      yield* config.get()
      bootProfile("config.get", Math.round(performance.now() - cfgStart))
      // Plugin can mutate config so it has to be initialized before anything else.
      const pluginStart = performance.now()
      yield* plugin.init()
      bootProfile("plugin.init", Math.round(performance.now() - pluginStart))
      // Each service self-manages its own slow work via Effect.forkScoped against
      // its per-instance state scope. We just await materialization here.
      const services = [
        { name: "reference.init", svc: reference },
        { name: "lsp.init", svc: lsp },
        { name: "shareNext.init", svc: shareNext },
        { name: "format.init", svc: format },
        { name: "vcs.init", svc: vcs },
        { name: "snapshot.init", svc: snapshot },
        { name: "project.init", svc: project },
      ] as const
      yield* Effect.forEach(
        services,
        ({ name, svc }) =>
          Effect.gen(function* () {
            const start = performance.now()
            yield* svc.init().pipe(
              Effect.catchCause((cause) => Effect.logWarning("init failed", { cause })),
            )
            bootProfile(name, Math.round(performance.now() - start))
          }),
        { concurrency: "unbounded", discard: true },
      ).pipe(Effect.withSpan("InstanceBootstrap.init"))
    }).pipe(Effect.withSpan("InstanceBootstrap"))

    return Service.of({ run })
  }),
)

export const defaultLayer: Layer.Layer<Service> = layer.pipe(
  Layer.provide([
    Config.defaultLayer,
    Format.defaultLayer,
    LSP.defaultLayer,
    Plugin.defaultLayer,
    Project.defaultLayer,
    Reference.defaultLayer,
    ShareNext.defaultLayer,
    Snapshot.defaultLayer,
    Vcs.defaultLayer,
  ]),
)

export * as InstanceBootstrap from "./bootstrap"
