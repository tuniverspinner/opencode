/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { AgentityBar } from "./agentitybar"

describe("agentitybar", () => {
  test("renders agent name when agent is set", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" _test={{ agentName: "Explorer" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("Explorer")
    } finally {
      app.renderer.destroy()
    }
  })

  test("shows 'Shell' in shell mode instead of agent name", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="shell" _test={{ agentName: "Explorer" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      const f = app.captureCharFrame()
      expect(f).toContain("Shell")
      expect(f).not.toContain("Explorer")
    } finally {
      app.renderer.destroy()
    }
  })

  test("renders model label in normal mode", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" _test={{ agentName: "Explorer", modelLabel: "DeepSeek V4" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("DeepSeek V4")
    } finally {
      app.renderer.destroy()
    }
  })

  test("renders provider label in normal mode", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" _test={{ agentName: "Explorer", providerLabel: "deepseek" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("deepseek")
    } finally {
      app.renderer.destroy()
    }
  })

  test("renders right content when provided", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" right={<text>status-badge</text>} _test={{ agentName: "Explorer" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("status-badge")
    } finally {
      app.renderer.destroy()
    }
  })

  test("toggles between 'Shell' and agent name by mode", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" _test={{ agentName: "Explorer", modelLabel: "DeepSeek V4" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      let f = app.captureCharFrame()
      expect(f).toContain("Explorer")
      expect(f).toContain("DeepSeek V4")
    } finally {
      app.renderer.destroy()
    }
  })

  test("renders variant name when showVariant is true and variantName is set", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" _test={{ agentName: "Explorer", modelLabel: "DeepSeek V4", showVariant: true, variantName: "high" }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      expect(app.captureCharFrame()).toContain("high")
    } finally {
      app.renderer.destroy()
    }
  })

  test("omits variant row when showVariant is false", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" _test={{ agentName: "Explorer", modelLabel: "DeepSeek V4", showVariant: false }} />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      const f = app.captureCharFrame()
      expect(f).toContain("Explorer")
      expect(f).toContain("DeepSeek V4")
    } finally {
      app.renderer.destroy()
    }
  })

  test("handles no agent gracefully — no crash, empty frame", async () => {
    const app = await testRender(() => (
      <box width={80} height={1}>
        <AgentityBar mode="normal" />
      </box>
    ), { width: 80, height: 1 })

    try {
      await app.renderOnce()
      expect(app.renderer.isDestroyed).toBe(false)
    } finally {
      app.renderer.destroy()
    }
  })
})
