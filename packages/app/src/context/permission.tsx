import { type Accessor, createMemo, onCleanup } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"
import type { PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "./server-sync"
import { useParams } from "@solidjs/router"
import { decode64 } from "@/utils/base64"
import { useSettings } from "./settings"
import { respondPermissionOnce } from "./permission-response"

function isNonAllowRule(rule: unknown) {
  if (!rule) return false
  if (typeof rule === "string") return rule !== "allow"
  if (typeof rule !== "object") return false
  if (Array.isArray(rule)) return false

  for (const action of Object.values(rule)) {
    if (action !== "allow") return true
  }

  return false
}

function hasPermissionPromptRules(permission: unknown) {
  if (!permission) return false
  if (typeof permission === "string") return permission !== "allow"
  if (typeof permission !== "object") return false
  if (Array.isArray(permission)) return false

  const config = permission as Record<string, unknown>
  return Object.values(config).some(isNonAllowRule)
}

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  gate: false,
  init: (props: { directory?: Accessor<string | undefined> }) => {
    const params = useParams()
    const serverSDK = useServerSDK()
    const serverSync = useServerSync()
    const settings = useSettings()
    const autoApprove = () => settings.permissions.autoApprove(serverSDK().scope)

    const permissionsEnabled = createMemo(() => {
      const directory = props.directory?.() ?? decode64(params.dir)
      if (!directory) return false
      const [store] = serverSync().child(directory)
      return hasPermissionPromptRules(store.config.permission)
    })

    function respondOnce(permission: PermissionRequest, directory?: string) {
      respondPermissionOnce({
        scope: serverSDK().scope,
        permission,
        directory,
        respond: (input) => serverSDK().client.permission.respond(input),
      })
    }

    const unsubscribe = serverSDK().event.listen((e) => {
      const event = e.details
      if (event?.type !== "permission.asked") return
      if (!autoApprove()) return
      respondOnce(event.properties, e.name)
    })
    onCleanup(unsubscribe)

    function setAutoApprove(value: boolean) {
      settings.permissions.setAutoApprove(serverSDK().scope, value)
      if (!value) return
      for (const requests of Object.values(serverSync().session.data.permission)) {
        for (const permission of requests ?? []) {
          const directory = serverSync().session.get(permission.sessionID)?.directory
          if (directory) respondOnce(permission, directory)
        }
      }
    }

    return {
      autoApprove,
      setAutoApprove,
      autoResponds(_permission: PermissionRequest, _directory?: string) {
        return autoApprove()
      },
      permissionsEnabled,
      isPermissionAllowAll(directory: string) {
        const [childStore] = serverSync().child(directory)
        const perm = childStore.config.permission
        return typeof perm === "string" && perm === "allow"
      },
    }
  },
})
