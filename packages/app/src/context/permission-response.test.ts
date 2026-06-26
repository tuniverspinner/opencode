import { beforeEach, describe, expect, test } from "bun:test"
import type { PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { ServerConnection } from "@/context/server"
import { ServerScope } from "@/utils/server-scope"
import { respondPermissionOnce } from "./permission-response"

const permission = (id: string): PermissionRequest => ({
  id,
  sessionID: "session",
  permission: "bash",
  patterns: ["git status"],
  metadata: {},
  always: [],
})

const pending: Array<Parameters<Parameters<typeof respondPermissionOnce>[0]["respond"]>[0]> = []
const respond = async (input: (typeof pending)[number]) => {
  pending.push(input)
}

beforeEach(() => {
  pending.length = 0
})

describe("respondPermissionOnce", () => {
  test("deduplicates the same request across provider instances", () => {
    const request = permission(`permission-dedupe-${Date.now()}`)
    const input = { scope: ServerScope.local, permission: request, directory: "/repo", respond }

    respondPermissionOnce(input)
    respondPermissionOnce(input)

    expect(pending).toEqual([{ sessionID: "session", permissionID: request.id, response: "once", directory: "/repo" }])
  })

  test("keeps requests on different servers independent", () => {
    const request = permission(`permission-server-${Date.now()}`)

    respondPermissionOnce({ scope: ServerScope.local, permission: request, respond })
    respondPermissionOnce({
      scope: ServerScope.fromServerKey(ServerConnection.Key.make("remote")),
      permission: request,
      respond,
    })

    expect(pending).toHaveLength(2)
  })

  test("allows a retry after a failed response", async () => {
    const request = permission(`permission-retry-${Date.now()}`)
    let attempts = 0
    const fail = async () => {
      attempts += 1
      throw new Error("failed")
    }

    respondPermissionOnce({ scope: ServerScope.local, permission: request, respond: fail })
    await Promise.resolve()
    await Promise.resolve()
    respondPermissionOnce({ scope: ServerScope.local, permission: request, respond: fail })

    expect(attempts).toBe(2)
  })
})
