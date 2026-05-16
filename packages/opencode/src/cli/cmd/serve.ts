import { Effect } from "effect"
import { Server } from "../../server/server"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .option("socket", {
        type: "string",
        describe: "Unix socket path or Windows named pipe name/path to listen on",
      }),
  describe: "starts a headless opencode server",
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    if (args.socket) {
      const server = yield* Effect.promise(() =>
        Server.listen({ type: "socket", socket: resolveSocketPath(args.socket) }),
      )
      console.log(`opencode server listening on socket ${server.socket}`)
      yield* Effect.never
    }

    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`opencode server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})

function resolveSocketPath(input: string) {
  if (process.platform !== "win32") return input
  const lower = input.toLowerCase()
  if (lower.startsWith("\\\\.\\pipe\\") || lower.startsWith("\\\\?\\pipe\\")) return input
  const name = input
    .replace(/^[a-zA-Z]:/, (drive) => drive.slice(0, 1))
    .replace(/[\\/:]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `\\\\.\\pipe\\${name || "opencode"}`
}


