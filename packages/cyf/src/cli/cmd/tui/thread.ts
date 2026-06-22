import { cmd } from "@/cli/cmd/cmd"
import { Rpc } from "@/util/rpc"
import { type rpc } from "./worker"
import path from "path"
import { fileURLToPath } from "url"
import { UI } from "@/cli/ui"
import * as Log from "@cyf-ai/core/util/log"
import { errorMessage } from "@/util/error"
import { withTimeout } from "@/util/timeout"
import { withNetworkOptions, resolveNetworkOptionsNoConfig } from "@/cli/network"
import { Filesystem } from "@/util/filesystem"
import type { GlobalEvent } from "@cyf-ai/sdk/v2"
import type { EventSource } from "./context/sdk"
import { writeHeapSnapshot } from "v8"
import {
  CYF_PROCESS_ROLE,
  CYF_RUN_ID,
  ensureRunID,
  sanitizedProcessEnv,
} from "@cyf-ai/core/util/opencode-process"
import { bootTrace } from "@/util/boot-trace"
import { runTuiSession } from "./prepare-tui-session"

declare global {
  const CYF_WORKER_PATH: string
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    subscribe: async (handler) => {
      return client.on<GlobalEvent>("global.event", (e) => {
        handler(e)
      })
    },
  }
}

async function target() {
  if (typeof CYF_WORKER_PATH !== "undefined") return CYF_WORKER_PATH
  const dist = new URL("./cli/cmd/tui/worker.js", import.meta.url)
  if (await Filesystem.exists(fileURLToPath(dist))) return dist
  return new URL("./worker.ts", import.meta.url)
}

async function input(value?: string) {
  const piped = process.stdin.isTTY ? undefined : await Bun.stdin.text()
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

export function resolveThreadDirectory(project?: string, envPWD = process.env.PWD, cwd = process.cwd()) {
  const root = Filesystem.resolve(envPWD ?? cwd)
  if (project) return Filesystem.resolve(path.isAbsolute(project) ? project : path.join(root, project))
  return Filesystem.resolve(cwd)
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start opencode tui",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start opencode in",
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      }),
  handler: async (args) => {
    bootTrace("TUI: handler start")

    const prompt = await input(args.prompt)

    const next = resolveThreadDirectory(args.project)
    try {
      process.chdir(next)
    } catch {
      UI.error("Failed to change directory to " + next)
      return
    }
    const cwd = Filesystem.resolve(process.cwd())

    let client!: RpcClient

    await runTuiSession({
      args: {
        continue: args.continue,
        sessionID: args.session,
        fork: args.fork,
        agent: args.agent,
        model: args.model,
        prompt,
      },
      onSnapshot: async () => {
        const tui = writeHeapSnapshot("tui.heapsnapshot")
        const server = await client.call("snapshot", undefined)
        return [tui, server]
      },
      setup: async () => {
        const file = await target()
        const env = sanitizedProcessEnv({
          [CYF_PROCESS_ROLE]: "worker",
          [CYF_RUN_ID]: ensureRunID(),
        })

        const worker = new Worker(file, {
          env,
        })
        bootTrace("TUI: worker spawned")
        worker.onerror = (e) => {
          Log.Default.error("thread error", {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            error: e.error,
          })
        }

        client = Rpc.client<typeof rpc>(worker)
        const error = (e: unknown) => {
          Log.Default.error("process error", { error: errorMessage(e) })
        }
        const reload = () => {
          client.call("reload", undefined).catch((err) => {
            Log.Default.warn("worker reload failed", {
              error: errorMessage(err),
            })
          })
        }
        process.on("uncaughtException", error)
        process.on("unhandledRejection", error)
        process.on("SIGUSR2", reload)

        let stopped = false
        const stop = async () => {
          if (stopped) return
          stopped = true
          process.off("uncaughtException", error)
          process.off("unhandledRejection", error)
          process.off("SIGUSR2", reload)
          await withTimeout(client.call("shutdown", undefined), 5000).catch((error) => {
            Log.Default.warn("worker shutdown failed", {
              error: errorMessage(error),
            })
          })
          worker.terminate()
        }

        const network = resolveNetworkOptionsNoConfig(args)
        const external =
          process.argv.includes("--port") ||
          process.argv.includes("--hostname") ||
          process.argv.includes("--mdns") ||
          network.mdns ||
          network.port !== 0 ||
          network.hostname !== "127.0.0.1"

        const transport = external
          ? {
              url: (await client.call("server", network)).url,
              fetch: undefined,
              events: undefined,
            }
          : {
              url: "http://opencode.internal",
              fetch: createWorkerFetch(client),
              events: createEventSource(client),
            }

        return {
          url: transport.url,
          directory: cwd,
          fetch: transport.fetch,
          events: transport.events,
          cleanup: stop,
        }
      },
      afterValidate: () => {
        setTimeout(() => {
          client.call("checkUpgrade", { directory: cwd }).catch(() => {})
        }, 1000).unref?.()
      },
    })

    process.exit(0)
  },
})
