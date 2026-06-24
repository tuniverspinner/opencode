declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
  const OPENCODE_LOCAL_BUILD: boolean
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal =
  (typeof OPENCODE_LOCAL_BUILD === "boolean" && OPENCODE_LOCAL_BUILD) || InstallationChannel === "local"
