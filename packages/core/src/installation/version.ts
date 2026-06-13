declare global {
  const CYF_VERSION: string
  const CYF_CHANNEL: string
}

export const InstallationVersion = typeof CYF_VERSION === "string" ? CYF_VERSION : "local"
export const InstallationChannel = typeof CYF_CHANNEL === "string" ? CYF_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
