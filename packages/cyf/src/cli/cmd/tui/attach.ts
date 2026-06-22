import { cmd } from "../cmd"
import { ServerAuth } from "@/server/auth"

export const AttachCommand = cmd({
  command: "attach <url>",
  describe: "attach to a running opencode server",
  builder: (yargs) =>
    yargs
      .positional("url", {
        type: "string",
        describe: "http://localhost:4096",
        demandOption: true,
      })
      .option("dir", {
        type: "string",
        description: "directory to run in",
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
      .option("password", {
        alias: ["p"],
        type: "string",
        describe: "basic auth password (defaults to CYF_SERVER_PASSWORD)",
      })
      .option("username", {
        alias: ["u"],
        type: "string",
        describe: "basic auth username (defaults to CYF_SERVER_USERNAME or 'cyf')",
      }),
  handler: async (args) => {
    const { runTuiSession } = await import("./prepare-tui-session")

    await runTuiSession({
      args: {
        continue: args.continue,
        sessionID: args.session,
        fork: args.fork,
      },
      setup: async () => {
        const directory = (() => {
          if (!args.dir) return undefined
          try {
            process.chdir(args.dir)
            return process.cwd()
          } catch {
            return args.dir
          }
        })()
        const headers = ServerAuth.headers({ password: args.password, username: args.username })

        return {
          url: args.url,
          directory,
          headers,
        }
      },
    })
  },
})
