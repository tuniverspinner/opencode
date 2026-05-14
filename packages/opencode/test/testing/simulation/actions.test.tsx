/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import { SimulationActions } from "../../../src/testing/simulation/actions"

describe("SimulationActions", () => {
  test("discovers focused editors and executes text actions", async () => {
    const [value, setValue] = createSignal("")
    const app = await testRender(
      () => <input focused onInput={setValue} width={20} />,
      { width: 40, height: 8 },
    )

    try {
      await app.renderOnce()
      const items = SimulationActions.elements(app.renderer)
      expect(items.some((item) => item.editor)).toBe(true)

      await SimulationActions.execute(app, { type: "typeText", text: "hello" })
      expect(value()).toBe("hello")
    } finally {
      app.renderer.destroy()
    }
  })

  test("discovers focusable elements and executes focus actions", async () => {
    let box: any
    const app = await testRender(
      () => <box ref={box} focusable style={{ width: 10, height: 3 }} />,
      { width: 40, height: 8 },
    )

    try {
      await app.renderOnce()
      const target = SimulationActions.elements(app.renderer).find((item) => item.id === box.id)
      expect(target?.focusable).toBe(true)
      expect(box.focused).toBe(false)

      await SimulationActions.execute(app, { type: "focus", target: box.num })
      expect(box.focused).toBe(true)
    } finally {
      app.renderer.destroy()
    }
  })

  test("discovers clickable elements and executes click actions", async () => {
    let clicked = 0
    const app = await testRender(
      () => <box onMouseDown={() => clicked++} style={{ width: 10, height: 3 }} />,
      { width: 40, height: 8, useMouse: true },
    )

    try {
      await app.renderOnce()
      const click = SimulationActions.actions(app.renderer).find((action) => action.type === "click")
      expect(click).toBeDefined()
      await SimulationActions.execute(app, click!)
      expect(clicked).toBe(1)
    } finally {
      app.renderer.destroy()
    }
  })
})
