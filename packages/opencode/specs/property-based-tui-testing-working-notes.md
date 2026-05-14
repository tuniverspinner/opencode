# Property-Based TUI Testing Working Notes

## Mock LLM Provider

- `SessionPrompt` gets model metadata through `Provider.Service.getModel(...)`.
- Actual generation is routed through `LLM.Service` / `streamText(...)`, so the first mock should return an AI SDK `LanguageModelV3` from the provider service.
- The normal `Provider.layer` builds providers from config/models.dev/plugin state. For first pass, the simulated graph can replace `Provider.Service` with a smaller simulation provider service instead of trying to flow through provider config.
- Control state should own an ordered LLM script queue. The provider/model should consume from that queue when the AI SDK calls the language model.
- First version can support text-only output. Tool calls and stream chunk fidelity can come next.
- Missing script should fail loudly with a typed simulation error, not silently return an empty assistant message.
- Implemented `SimulationProvider.layer`, replacing `Provider.Service` in `createSimulatedRoutes`.
- The provider exposes provider `simulation` and model `mock`.
- `doGenerate` and `doStream` both consume one queued script through `Simulation.Service.nextLLM()`.
- Current script support: `text`, `thinking` (treated as text for now), and `error`.
- Snapshot currently records `llmQueued` and `llmConsumed`, not per-step details yet.

## OpenTUI Fake Renderer

- OpenTUI Solid exposes `testRender(...)` from `@opentui/solid`.
- The lower-level core API is `createTestRenderer(...)` from `@opentui/core/testing`.
- `createTestRenderer(...)` returns `renderer`, `mockInput`, `mockMouse`, `renderOnce`, `captureCharFrame`, `captureSpans`, and `resize`.
- `captureCharFrame()` is the simple screen-buffer string API used heavily in OpenTUI snapshots.
- `captureSpans()` returns structured lines/spans plus cursor position, which is a better starting point for visible element discovery than parsing raw characters.
- `mockInput` supports interactions like `typeText`, `pressEnter`, and `pressArrow`.
- Implemented `TuiSimulation.createSimulationRenderer(...)` beside `thread.ts`. It creates a test renderer and exposes `renderOnce`, `screen`, `spans`, and `destroy`.
- `thread.ts` checks `OPENCODE_SIMULATION`, creates the fake renderer there, starts the normal worker/backend, and passes the renderer into `tui(...)`.
- `tui(...)` now accepts an injected `CliRenderer`, test mode, and an `onReady` callback. Production still creates the real renderer.

## OpenTUI Action APIs

- Interactable discovery can walk `renderer.root.getChildren()` recursively.
- `Renderable.focusable` and `Renderable.focused` are public and enough to discover focus targets.
- `renderer.currentFocusedEditor` identifies active text input/edit-buffer targets for typing/submission.
- `renderer.hitTest(x, y)` maps terminal coordinates through the hit grid to a renderable id.
- Renderables have public geometry: `screenX`, `screenY`, `width`, `height`, and `num`.
- Mouse listener metadata is stored internally on renderables; first pass checks `_mouseListener` / `_mouseListeners` at runtime to identify clickable targets. This is pragmatic but not a stable public API.
- Test execution uses `mockInput.typeText`, `mockInput.pressEnter`, `mockInput.pressArrow`, and `mockMouse.click` from OpenTUI testing.
- Implemented `SimulationActions` with `elements(...)`, `actions(...)`, and `execute(...)`.
