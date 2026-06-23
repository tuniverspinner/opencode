#!/usr/bin/env bun

import { Effect } from "effect"
import { ModelsDev } from "@cyf-ai/core/models-dev"
import { Global } from "@cyf-ai/core/global"
import path from "path"

const main = Effect.gen(function* () {
  const modelsDev = yield* ModelsDev.Service
  yield* modelsDev.refresh(false)
  const catalog = yield* modelsDev.get()

  const { data } = yield* Global.Service
  const authFile = path.join(data, "auth.json")
  const auth = yield* Effect.tryPromise({
    try: () => Bun.file(authFile).json(),
    catch: () => ({} as Record<string, { type: string; key: string }>),
  })

  const connectedIDs = new Set(Object.keys(auth))

  let count = 0
  for (const [id, provider] of Object.entries(catalog).sort()) {
    if (!connectedIDs.has(id)) continue
    count++
    const cred = auth[id]
    console.log(`${id}  (${provider.name})`)
    if (cred?.key) {
      console.log(`  key: ${cred.key.slice(0, 12)}...`)
    }
    for (const [modelId, model] of Object.entries(provider.models).sort()) {
      if (model.status === "deprecated") continue
      console.log(`  ${model.name ?? modelId}`)
    }
    console.log()
  }

  if (count === 0) {
    console.log("No connected providers found.")
    console.log(`Auth file: ${authFile}`)
  }
})

await main.pipe(
  Effect.provide(ModelsDev.defaultLayer),
  Effect.provide(Global.defaultLayer),
  Effect.runPromise,
)
