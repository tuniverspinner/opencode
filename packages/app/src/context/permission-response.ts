import type { PermissionRequest } from "@opencode-ai/sdk/v2/client"
import type { ServerScope } from "@/utils/server-scope"

const MAX_RESPONDED = 1000
const RESPONDED_TTL_MS = 60 * 60 * 1000
const responded = new Map<string, number>()

function key(scope: ServerScope, permissionID: string) {
  return `${scope}\0${permissionID}`
}

function prune(now: number) {
  for (const [id, ts] of responded) {
    if (now - ts < RESPONDED_TTL_MS) break
    responded.delete(id)
  }

  for (const id of responded.keys()) {
    if (responded.size <= MAX_RESPONDED) break
    responded.delete(id)
  }
}

export function respondPermissionOnce(input: {
  scope: ServerScope
  permission: PermissionRequest
  directory?: string
  respond: (input: {
    sessionID: string
    permissionID: string
    response: "once"
    directory?: string
  }) => Promise<unknown>
}) {
  const id = key(input.scope, input.permission.id)
  const now = Date.now()
  const hit = responded.has(id)
  responded.delete(id)
  responded.set(id, now)
  prune(now)
  if (hit) return

  void input
    .respond({
      sessionID: input.permission.sessionID,
      permissionID: input.permission.id,
      response: "once",
      directory: input.directory,
    })
    .catch(() => responded.delete(id))
}
