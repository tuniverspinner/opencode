import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/ServerAutoApprove"
const projectID = "proj_server_auto_approve"
const sourceID = "ses_server_auto_approve_source"
const targetID = "ses_server_auto_approve_target"
const sourceTitle = "Configure server auto-approve"
const targetTitle = "Use server auto-approve"

type EventPayload = {
  directory: string
  payload: Record<string, unknown>
}

test("auto-approves permission requests across sessions on the same server", async ({ page }) => {
  const events: EventPayload[] = []
  const replies: Array<{ path: string; body: unknown }> = []

  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "server-auto-approve",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": {
              id: "claude-opus-4-6",
              name: "Claude Opus 4.6",
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [session(sourceID, sourceTitle, 1700000000000), session(targetID, targetTitle, 1700000001000)],
    pageMessages: () => ({ items: [] }),
    events: () => events.splice(0, 1),
    eventRetry: 16,
  })
  await page.route("**/pty/shells*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  )
  await configurePage(page)

  page.on("request", (request) => {
    const url = new URL(request.url())
    if (request.method() !== "POST" || !url.pathname.includes("/permissions/")) return
    replies.push({ path: url.pathname, body: request.postDataJSON() })
    const requestID = url.pathname.split("/").at(-1)!
    events.push(permissionReplied(targetID, requestID))
  })

  await page.goto(sessionHref(sourceID))
  await expectSessionTitle(page, sourceTitle)
  await page.keyboard.press("Control+Comma")
  const settings = page.getByRole("dialog")
  await expect(settings).toBeVisible()
  const autoApprove = settings.getByRole("switch").first()
  await expect(autoApprove).not.toBeChecked()
  await autoApprove.focus()
  await page.keyboard.press("Space")
  await expect(autoApprove).toBeChecked()
  await page.keyboard.press("Escape")
  await expect(settings).toHaveCount(0)

  await page.getByRole("button", { name: "Home" }).click()
  await expect(page).toHaveURL("/")
  await page.getByText(targetTitle, { exact: true }).last().click()
  await expect(page).toHaveURL(sessionHref(targetID))
  await expectSessionTitle(page, targetTitle)
  events.push(permissionAsked(targetID, "permission-auto", "git status"))

  await expect
    .poll(() => replies)
    .toEqual([
      {
        path: `/session/${targetID}/permissions/permission-auto`,
        body: { response: "once" },
      },
    ])
  await expect(page.locator('[data-component="dock-prompt"][data-kind="permission"]')).toHaveCount(0)

  await page.keyboard.press("Control+Comma")
  await expect(settings).toBeVisible()
  await autoApprove.focus()
  await page.keyboard.press("Space")
  await expect(autoApprove).not.toBeChecked()
  await page.keyboard.press("Escape")
  await expect(settings).toHaveCount(0)

  events.push(permissionAsked(targetID, "permission-manual", "git diff"))
  const dock = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await expect(dock).toBeVisible()
  await expect(dock.getByText("git diff", { exact: true })).toBeVisible()
  expect(replies).toHaveLength(1)
})

function session(id: string, title: string, created: number) {
  return {
    id,
    slug: id,
    projectID,
    directory,
    title,
    version: "dev",
    time: { created, updated: created },
  }
}

function permissionAsked(sessionID: string, id: string, pattern: string): EventPayload {
  return {
    directory,
    payload: {
      type: "permission.asked",
      properties: { id, sessionID, permission: "bash", patterns: [pattern], metadata: {}, always: [] },
    },
  }
}

function permissionReplied(sessionID: string, requestID: string): EventPayload {
  return {
    directory,
    payload: { type: "permission.replied", properties: { sessionID, requestID, reply: "once" } },
  }
}

function sessionHref(sessionID: string) {
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  return `/server/${base64Encode(server)}/session/${sessionID}`
}

async function configurePage(page: Parameters<typeof mockOpenCodeServer>[0]) {
  const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
  await page.addInitScript(
    ({ directory, server, sessionIDs }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          projects: { local: [{ worktree: directory, expanded: true }] },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:tabs",
        JSON.stringify(
          sessionIDs.map((sessionId) => ({ type: "session", server, dirBase64: base64Encode(directory), sessionId })),
        ),
      )
    },
    { directory, server, sessionIDs: [sourceID, targetID] },
  )
}
