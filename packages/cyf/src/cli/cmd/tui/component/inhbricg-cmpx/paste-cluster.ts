import path from "path"
import { fileURLToPath } from "url"
import { produce, type SetStoreFunction } from "solid-js/store"
import { TextareaRenderable } from "@opentui/core"
import { Filesystem } from "@/util/filesystem"
import { promptOffsetWidth } from "@/cli/cmd/prompt-display"
import { iife } from "@/util/iife"
import type { FilePart } from "@cyf-ai/sdk/v2"
import type { PromptInfo } from "../input-block/history"

const DRAFT_RETENTION_MIN_CHARS = 20

export type PasteStore = {
  prompt: PromptInfo
  mode: "normal" | "shell"
  extmarkToPartIndex: Map<number, number>
}

export type PasteHistory = {
  append(item: PromptInfo): void
}

export interface PasteClusterDeps<S extends PasteStore = PasteStore> {
  getInput: () => TextareaRenderable | undefined
  store: S
  setStore: SetStoreFunction<S>
  history: PasteHistory
  pasteStyleId: number
  partTypeId: () => number
  pasteSummaryEnabled: () => boolean
  filesystem: typeof Filesystem
  requestRender: () => void
}

export function usePasteCluster<S extends PasteStore>(deps: PasteClusterDeps<S>) {
  const { getInput, store, setStore, history, pasteStyleId, partTypeId, pasteSummaryEnabled, filesystem: fs, requestRender } = deps

  function pasteText(text: string, virtualText: string) {
    const input = getInput()!
    const currentOffset = input.cursorOffset
    const extmarkStart = currentOffset
    const extmarkEnd = extmarkStart + promptOffsetWidth(virtualText)

    input.insertText(virtualText + " ")

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: partTypeId(),
    })

    setStore(
      produce((draft: S) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push({
          type: "text" as const,
          text,
          source: {
            text: {
              start: extmarkStart,
              end: extmarkEnd,
              value: virtualText,
            },
          },
        })
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
  }

  async function pasteInputText(text: string) {
    const input = getInput()!
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    const pastedContent = normalizedText.trim()
    const filepath = iife(() => {
      const raw = pastedContent.replace(/^['"]+|['"]+$/g, "")
      if (raw.startsWith("file://")) {
        try {
          return fileURLToPath(raw)
        } catch {}
      }
      if (process.platform === "win32") return raw
      return raw.replace(/\\(.)/g, "$1")
    })
    const isUrl = /^(https?):\/\//.test(filepath)
    if (!isUrl) {
      try {
        const mime = await fs.mimeType(filepath)
        const filename = path.basename(filepath)
        if (mime === "image/svg+xml") {
          const content = await fs.readText(filepath).catch(() => {})
          if (content) {
            pasteText(content, `[SVG: ${filename ?? "image"}]`)
            return
          }
        }
        if (mime.startsWith("image/") || mime === "application/pdf") {
          const content = await fs.readArrayBuffer(filepath)
            .then((buffer) => Buffer.from(buffer).toString("base64"))
            .catch(() => {})
          if (content) {
            await pasteAttachment({
              filename,
              filepath,
              mime,
              content,
            })
            return
          }
        }
      } catch {}
    }

    const lineCount = (pastedContent.match(/\n/g)?.length ?? 0) + 1
    if (
      (lineCount >= 3 || pastedContent.length > 150) &&
      pasteSummaryEnabled()
    ) {
      pasteText(pastedContent, `[Pasted ~${lineCount} lines]`)
      return
    }

    input.insertText(normalizedText)

    setTimeout(() => {
      const input = getInput()
      if (!input || input.isDestroyed) return
      input.getLayoutNode().markDirty()
      requestRender()
    }, 0)
  }

  async function pasteAttachment(file: { filename?: string; filepath?: string; content: string; mime: string }) {
    const input = getInput()!
    const currentOffset = input.cursorOffset
    const extmarkStart = currentOffset
    const pdf = file.mime === "application/pdf"
    const count = store.prompt.parts.filter((x) => {
      if (x.type !== "file") return false
      if (pdf) return x.mime === "application/pdf"
      return x.mime.startsWith("image/")
    }).length
    const virtualText = pdf ? `[PDF ${count + 1}]` : `[Image ${count + 1}]`
    const extmarkEnd = extmarkStart + virtualText.length
    const textToInsert = virtualText + " "

    input.insertText(textToInsert)

    const extmarkId = input.extmarks.create({
      start: extmarkStart,
      end: extmarkEnd,
      virtual: true,
      styleId: pasteStyleId,
      typeId: partTypeId(),
    })

    const part: Omit<FilePart, "id" | "messageID" | "sessionID"> = {
      type: "file" as const,
      mime: file.mime,
      filename: file.filename,
      url: `data:${file.mime};base64,${file.content}`,
      source: {
        type: "file",
        path: file.filepath ?? file.filename ?? "",
        text: {
          start: extmarkStart,
          end: extmarkEnd,
          value: virtualText,
        },
      },
    }
    setStore(
      produce((draft: S) => {
        const partIndex = draft.prompt.parts.length
        draft.prompt.parts.push(part)
        draft.extmarkToPartIndex.set(extmarkId, partIndex)
      }),
    )
    return
  }

  function clearPrompt() {
    if (store.prompt.input.trim().length >= DRAFT_RETENTION_MIN_CHARS || store.prompt.parts.length > 0) {
      history.append({
        ...store.prompt,
        mode: store.mode,
      })
    }
    const input = getInput()!
    input.clear()
    input.extmarks.clear()
    setStore(
      produce((draft: S) => {
        draft.prompt = { input: "", parts: [] }
        draft.extmarkToPartIndex = new Map()
      }),
    )
  }

  return { pasteText, pasteInputText, pasteAttachment, clearPrompt }
}
