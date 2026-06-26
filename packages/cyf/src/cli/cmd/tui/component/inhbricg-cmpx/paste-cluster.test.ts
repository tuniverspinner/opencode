import { describe, expect, test, mock } from "bun:test"
import { createStore, type SetStoreFunction } from "solid-js/store"
import { usePasteCluster, type PasteClusterDeps, type PasteStore } from "./paste-cluster"

function makeFakeInput() {
  let cursorOffset = 0
  let extmarkId = 0
  const insertions: string[] = []
  const extmarks: { start: number; end: number; styleId: number; typeId: number; virtual: boolean }[] = []

  const clears = mock(() => {})
  const extmarkClears = mock(() => {})

  return {
    insertions,
    clears,
    extmarks,
    extmarkClears,
    reset() { cursorOffset = 0; extmarkId = 0; insertions.length = 0; extmarks.length = 0 },
    proxy: {
      get cursorOffset() { return cursorOffset },
      set cursorOffset(v: number) { cursorOffset = v },
      insertText(text: string) { insertions.push(text); cursorOffset += text.length },
      isDestroyed: false,
      clear: () => { clears(); cursorOffset = 0; insertions.length = 0 },
      extmarks: {
        create(opts: { start: number; end: number; styleId: number; typeId: number; virtual: boolean }) {
          extmarks.push(opts)
          extmarkId += 1
          return extmarkId
        },
        getAllForTypeId: () => extmarks.map((e, i) => ({ id: i + 1, typeId: e.typeId })),
        clear: extmarkClears,
        registerType: () => 1,
      },
      getLayoutNode: () => ({ markDirty: () => {} }),
    },
  }
}

function makeFakeFilesystem() {
  const mimeTypes: Record<string, string> = {}
  const contents: Record<string, string> = {}
  return {
    set(filepath: string, mime: string, content: string) { mimeTypes[filepath] = mime; contents[filepath] = content },
    mimeType: (filepath: string) => Promise.resolve(mimeTypes[filepath] ?? "application/octet-stream"),
    readText: (filepath: string) => Promise.resolve(contents[filepath] ?? ""),
    readArrayBuffer: (filepath: string) => Promise.resolve(new TextEncoder().encode(contents[filepath] ?? "").buffer),
  }
}

type TestStore = PasteStore & { prompt: { input: string; parts: any[] } }

function makeDeps(overrides: Partial<PasteClusterDeps> = {}): { deps: PasteClusterDeps; input: ReturnType<typeof makeFakeInput>; store: TestStore; setStore: SetStoreFunction<TestStore>; history: { append: ReturnType<typeof mock> } } {
  const input = makeFakeInput()
  const [store, setStore] = createStore<TestStore>({
    prompt: { input: "", parts: [] },
    mode: "normal",
    extmarkToPartIndex: new Map(),
  })
  const append = mock(() => {})

  const deps: PasteClusterDeps = {
    getInput: () => input.proxy as any,
    store,
    setStore,
    history: { append },
    pasteStyleId: 42,
    partTypeId: () => 1,
    pasteSummaryEnabled: () => true,
    filesystem: makeFakeFilesystem() as any,
    requestRender: () => {},
    ...overrides,
  }
  return { deps, input, store, setStore, history: { append } }
}

function makeCluster(overrides: Partial<PasteClusterDeps> = {}) {
  const { deps, input, store, setStore, history } = makeDeps(overrides)
  return { cluster: usePasteCluster(deps), input, store, setStore, history }
}

describe("paste-cluster", () => {
  test("pasteText creates a text part with source and extmark", () => {
    const { cluster, input, store } = makeCluster()
    cluster.pasteText("hello world", "[Pasted ~3 lines]")

    expect(input.insertions).toEqual(["[Pasted ~3 lines] "])
    expect(input.extmarks).toHaveLength(1)
    expect(input.extmarks[0].styleId).toBe(42)
    expect(input.extmarks[0].typeId).toBe(1)
    expect(store.prompt.parts).toHaveLength(1)
    expect(store.prompt.parts[0].type).toBe("text")
    expect(store.prompt.parts[0].text).toBe("hello world")
    expect(store.prompt.parts[0].source.text.value).toBe("[Pasted ~3 lines]")
  })

  test("pasteInputText inserts short text directly below summary threshold", async () => {
    const { cluster, input } = makeCluster({ pasteSummaryEnabled: () => false })
    await cluster.pasteInputText("hi")

    expect(input.insertions).toContain("hi")
    expect(input.extmarks).toHaveLength(0)
  })

  test("pasteInputText creates summary part for long text with summary enabled", async () => {
    const { cluster, store } = makeCluster({ pasteSummaryEnabled: () => true })
    const longText = "line1\nline2\nline3"
    await cluster.pasteInputText(longText)

    expect(store.prompt.parts).toHaveLength(1)
    expect(store.prompt.parts[0].type).toBe("text")
    expect(store.prompt.parts[0].source.text.value).toBe("[Pasted ~3 lines]")
  })

  test("pasteInputText inserts long text directly when summary disabled", async () => {
    const { cluster, input, store } = makeCluster({ pasteSummaryEnabled: () => false })
    await cluster.pasteInputText("line1\nline2\nline3")

    expect(input.insertions).toContain("line1\nline2\nline3")
    expect(store.prompt.parts).toHaveLength(0)
  })

  test("pasteInputText detects SVG path and creates text part", async () => {
    const fs = makeFakeFilesystem()
    fs.set("/tmp/image.svg", "image/svg+xml", "<svg></svg>")
    const { cluster, store } = makeCluster({ filesystem: fs as any })
    await cluster.pasteInputText("/tmp/image.svg")

    expect(store.prompt.parts).toHaveLength(1)
    expect(store.prompt.parts[0].type).toBe("text")
    expect(store.prompt.parts[0].text).toBe("<svg></svg>")
    expect(store.prompt.parts[0].source.text.value).toBe("[SVG: image.svg]")
  })

  test("pasteInputText detects image path and delegates to pasteAttachment", async () => {
    const fs = makeFakeFilesystem()
    fs.set("/tmp/pic.png", "image/png", "fakepngbytes")
    const { cluster, store } = makeCluster({ filesystem: fs as any })
    await cluster.pasteInputText("/tmp/pic.png")

    expect(store.prompt.parts).toHaveLength(1)
    expect(store.prompt.parts[0].type).toBe("file")
    expect(store.prompt.parts[0].mime).toBe("image/png")
    expect(store.prompt.parts[0].source.text.value).toBe("[Image 1]")
  })

  test("pasteAttachment creates file part with data URL", async () => {
    const { cluster, store } = makeCluster()
    await cluster.pasteAttachment({ filename: "test.png", content: "abc123", mime: "image/png" })

    expect(store.prompt.parts).toHaveLength(1)
    expect(store.prompt.parts[0].type).toBe("file")
    expect(store.prompt.parts[0].mime).toBe("image/png")
    expect(store.prompt.parts[0].url).toBe("data:image/png;base64,abc123")
    expect(store.prompt.parts[0].source.text.value).toBe("[Image 1]")
  })

  test("pasteAttachment increments image counter independently from PDF counter", async () => {
    const { cluster, store } = makeCluster()

    await cluster.pasteAttachment({ content: "a", mime: "image/png" })
    await cluster.pasteAttachment({ content: "b", mime: "application/pdf" })
    await cluster.pasteAttachment({ content: "c", mime: "image/jpeg" })

    expect(store.prompt.parts).toHaveLength(3)
    expect(store.prompt.parts[0].source.text.value).toBe("[Image 1]")
    expect(store.prompt.parts[1].source.text.value).toBe("[PDF 1]")
    expect(store.prompt.parts[2].source.text.value).toBe("[Image 2]")
  })

  test("clearPrompt appends to history when above retention threshold", () => {
    const { cluster, store, setStore, history } = makeCluster()
    setStore("prompt", "input", "This is a long enough prompt to exceed the draft retention threshold.")
    setStore("prompt", "parts", [{ type: "text", text: "extra", source: { text: { start: 0, end: 5, value: "[x]" } } } as any])

    cluster.clearPrompt()

    expect(history.append).toHaveBeenCalledTimes(1)
    expect(history.append.mock.calls[0][0].input).toBe("This is a long enough prompt to exceed the draft retention threshold.")
  })

  test("clearPrompt does not append when below threshold and no parts", () => {
    const { cluster, history } = makeCluster()

    cluster.clearPrompt()

    expect(history.append).not.toHaveBeenCalled()
  })

  test("clearPrompt resets store prompt and extmark map", () => {
    const { cluster, store, setStore, input } = makeCluster()
    setStore("prompt", "input", "some text")
    setStore("prompt", "parts", [{ type: "text", text: "x", source: { text: { start: 0, end: 5, value: "[x]" } } } as any])
    store.extmarkToPartIndex.set(1, 0)

    cluster.clearPrompt()

    expect(input.clears).toHaveBeenCalled()
    expect(input.extmarkClears).toHaveBeenCalled()
    expect(store.prompt.input).toBe("")
    expect(store.prompt.parts).toHaveLength(0)
    expect(store.extmarkToPartIndex.size).toBe(0)
  })
})
