import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Effect } from "effect"
import { Daemon } from "../../services/daemon"
import { Standalone } from "../../services/standalone"

export default Runtime.handler(Commands, (input) =>
  Effect.gen(function* () {
    const daemon = yield* Daemon.Service
    const transport = yield* (input.standalone ? Standalone.transport() : daemon.transport())
    const { runTui } = yield* Effect.promise(() => import("../../tui"))
    yield* runTui(transport)
  }),
)
