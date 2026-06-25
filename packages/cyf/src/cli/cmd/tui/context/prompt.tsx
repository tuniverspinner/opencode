import { createSimpleContext } from "./helper"
import type { PromptRef } from "../component/input-block"

export const { use: usePromptRef, provider: PromptRefProvider } = createSimpleContext({
  name: "PromptRef",
  init: () => {
    let current: PromptRef | undefined

    return {
      get current() {
        return current
      },
      set(ref: PromptRef | undefined) {
        current = ref
      },
    }
  },
})
