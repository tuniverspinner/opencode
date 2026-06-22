import semver from "semver"
import { TuiEvent } from "./event"
import { DialogAlert } from "./ui/dialog-alert"
import { DialogConfirm } from "./ui/dialog-confirm"
import { FormatError, FormatUnknownError } from "@/cli/error"
import type { useEvent } from "@tui/context/event"
import type { useOpencodeKeymap } from "./keymap"
import type { useProject } from "@tui/context/project"
import type { useToast } from "./ui/toast"
import type { useRoute } from "@tui/context/route"
import type { useKV } from "./context/kv"
import type { useDialog } from "@tui/ui/dialog"
import type { useSDK } from "@tui/context/sdk"
import type { useExit } from "./context/exit"

type Event = ReturnType<typeof useEvent>
type Keymap = ReturnType<typeof useOpencodeKeymap>
type Project = ReturnType<typeof useProject>
type Toast = ReturnType<typeof useToast>
type Route = ReturnType<typeof useRoute>
type KV = ReturnType<typeof useKV>
type Dialog = ReturnType<typeof useDialog>
type SDK = ReturnType<typeof useSDK>
type Exit = ReturnType<typeof useExit>

export interface AppEventContext {
  event: Event
  keymap: Keymap
  project: Project
  toast: Toast
  route: Route
  kv: KV
  dialog: Dialog
  sdk: SDK
  exit: Exit
}

function errorMessage(error: unknown) {
  const formatted = FormatError(error)
  if (formatted !== undefined) return formatted
  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message
  }
  return FormatUnknownError(error)
}

export function registerAppEvents(ctx: AppEventContext): () => void {
  const { event, keymap, project, toast, route, kv, dialog, sdk, exit } = ctx
  const offs: (() => void)[] = []

  offs.push(
    event.on(TuiEvent.CommandExecute.type, (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      keymap.dispatchCommand(evt.properties.command)
    }),
  )

  offs.push(
    event.on(TuiEvent.ToastShow.type, (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      toast.show({
        title: evt.properties.title,
        message: evt.properties.message,
        variant: evt.properties.variant,
        duration: evt.properties.duration,
      })
    }),
  )

  offs.push(
    event.on(TuiEvent.SessionSelect.type, (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      route.navigate({
        type: "session",
        sessionID: evt.properties.sessionID,
      })
    }),
  )

  offs.push(
    event.on("session.deleted", (evt) => {
      if (route.data.type === "session" && route.data.sessionID === evt.properties.info.id) {
        route.navigate({ type: "home" })
        toast.show({
          variant: "info",
          message: "The current session was deleted",
        })
      }
    }),
  )

  offs.push(
    event.on("session.error", (evt, { workspace }) => {
      if (workspace !== project.workspace.current()) return
      const error = evt.properties.error
      if (error && typeof error === "object" && error.name === "MessageAbortedError") return
      const message = errorMessage(error)

      toast.show({
        variant: "error",
        message,
        duration: 5000,
      })
    }),
  )

  offs.push(
    event.on("installation.update-available", async (evt) => {
      console.log("installation.update-available", evt)
      const version = evt.properties.version

      const skipped = kv.get("skipped_version")
      if (skipped && !semver.gt(version, skipped)) return

      const choice = await DialogConfirm.show(
        dialog,
        `Update Available`,
        `A new release v${version} is available. Would you like to update now?`,
        "skip",
      )

      if (choice === false) {
        kv.set("skipped_version", version)
        return
      }

      if (choice !== true) return

      toast.show({
        variant: "info",
        message: `Updating to v${version}...`,
        duration: 30000,
      })

      const result = await sdk.client.global.upgrade({ target: version })

      if (result.error || !result.data?.success) {
        toast.show({
          variant: "error",
          title: "Update Failed",
          message: "Update failed",
          duration: 10000,
        })
        return
      }

      await DialogAlert.show(
        dialog,
        "Update Complete",
        `Successfully updated to OpenCode v${result.data.version}. Please restart the application.`,
      )

      void exit()
    }),
  )

  return () => {
    for (const off of offs) off()
  }
}
