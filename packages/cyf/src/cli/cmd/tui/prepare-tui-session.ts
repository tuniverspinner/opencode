import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32"
import { UI } from "@/cli/ui"
import { errorMessage } from "@/util/error"
import { validateSession } from "./validate-session"
import { bootTrace } from "@/util/boot-trace"
import type { Args } from "./context/args"
import type { EventSource } from "./context/sdk"

export interface TuiSessionTransport {
  url: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
}

export interface TuiSessionOptions {
  args: Args
  onSnapshot?: () => Promise<string[]>
  setup: () => Promise<TuiSessionTransport & { cleanup?: () => Promise<void> }>
  afterValidate?: () => void
}

export async function runTuiSession(options: TuiSessionOptions): Promise<void> {
  const unguard = win32InstallCtrlCGuard()
  let cleanup: (() => Promise<void>) | undefined
  try {
    win32DisableProcessedInput()

    if (options.args.fork && !options.args.continue && !options.args.sessionID) {
      UI.error("--fork requires --continue or --session")
      process.exitCode = 1
      return
    }

    const transport = await options.setup()
    cleanup = transport.cleanup
    const { url, directory, fetch, headers, events } = transport

    const { TuiConfig } = await import("./config/tui")
    const config = await TuiConfig.get()

    try {
      await validateSession({
        url,
        sessionID: options.args.sessionID,
        directory,
        fetch,
        headers,
      })
    } catch (error) {
      UI.error(errorMessage(error))
      process.exitCode = 1
      return
    }

    options.afterValidate?.()

    bootTrace("TUI: before createRenderer")
    const { createTuiRenderer, tui } = await import("./app")
    const renderer = await createTuiRenderer(config)
    bootTrace("TUI: after createRenderer")
    bootTrace("TUI: before mount")
    const handle = tui({
      url,
      config,
      renderer,
      directory,
      fetch,
      headers,
      events,
      args: {
        continue: options.args.continue,
        sessionID: options.args.sessionID,
        agent: options.args.agent,
        model: options.args.model,
        prompt: options.args.prompt,
        fork: options.args.fork,
      },
      onSnapshot: options.onSnapshot,
    })
    await handle.done
  } finally {
    await cleanup?.()
    unguard?.()
  }
}
