import { Config } from "effect"

export function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

const copy = process.env["CYF_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]

function enabledByExperimental(key: string) {
  return process.env[key] === undefined ? truthy("CYF_EXPERIMENTAL") : truthy(key)
}

export const Flag = {
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env["OTEL_EXPORTER_OTLP_ENDPOINT"],
  OTEL_EXPORTER_OTLP_HEADERS: process.env["OTEL_EXPORTER_OTLP_HEADERS"],

  CYF_AUTO_HEAP_SNAPSHOT: truthy("CYF_AUTO_HEAP_SNAPSHOT"),
  CYF_GIT_BASH_PATH: process.env["CYF_GIT_BASH_PATH"],
  CYF_CONFIG: process.env["CYF_CONFIG"],
  CYF_CONFIG_CONTENT: process.env["CYF_CONFIG_CONTENT"],
  CYF_DISABLE_AUTOUPDATE: truthy("CYF_DISABLE_AUTOUPDATE"),
  CYF_ALWAYS_NOTIFY_UPDATE: truthy("CYF_ALWAYS_NOTIFY_UPDATE"),
  CYF_DISABLE_PRUNE: truthy("CYF_DISABLE_PRUNE"),
  CYF_DISABLE_TERMINAL_TITLE: truthy("CYF_DISABLE_TERMINAL_TITLE"),
  CYF_SHOW_TTFD: truthy("CYF_SHOW_TTFD"),
  CYF_DISABLE_AUTOCOMPACT: truthy("CYF_DISABLE_AUTOCOMPACT"),
  CYF_DISABLE_MODELS_FETCH: truthy("CYF_DISABLE_MODELS_FETCH"),
  CYF_DISABLE_MOUSE: truthy("CYF_DISABLE_MOUSE"),
  CYF_FAKE_VCS: process.env["CYF_FAKE_VCS"],
  CYF_SERVER_PASSWORD: process.env["CYF_SERVER_PASSWORD"],
  CYF_SERVER_USERNAME: process.env["CYF_SERVER_USERNAME"],

  // Experimental
  CYF_EXPERIMENTAL_FILEWATCHER: Config.boolean("CYF_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  CYF_EXPERIMENTAL_DISABLE_FILEWATCHER: Config.boolean("CYF_EXPERIMENTAL_DISABLE_FILEWATCHER").pipe(
    Config.withDefault(false),
  ),
  CYF_EXPERIMENTAL_DISABLE_COPY_ON_SELECT:
    copy === undefined ? process.platform === "win32" : truthy("CYF_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"),
  CYF_MODELS_URL: process.env["CYF_MODELS_URL"],
  CYF_MODELS_PATH: process.env["CYF_MODELS_PATH"],
  CYF_DB: process.env["CYF_DB"],

  CYF_WORKSPACE_ID: process.env["CYF_WORKSPACE_ID"],
  CYF_EXPERIMENTAL_WORKSPACES: enabledByExperimental("CYF_EXPERIMENTAL_WORKSPACES"),
  CYF_EXPERIMENTAL_SESSION_SWITCHER: enabledByExperimental("CYF_EXPERIMENTAL_SESSION_SWITCHER"),

  // Evaluated at access time (not module load) because tests, the CLI, and
  // external tooling set these env vars at runtime.
  get CYF_DISABLE_PROJECT_CONFIG() {
    return truthy("CYF_DISABLE_PROJECT_CONFIG")
  },
  get CYF_EXPERIMENTAL_REFERENCES() {
    return enabledByExperimental("CYF_EXPERIMENTAL_REFERENCES")
  },
  get CYF_TUI_CONFIG() {
    return process.env["CYF_TUI_CONFIG"]
  },
  get CYF_CONFIG_DIR() {
    return process.env["CYF_CONFIG_DIR"]
  },
  get CYF_PURE() {
    return truthy("CYF_PURE")
  },
  get CYF_PERMISSION() {
    return process.env["CYF_PERMISSION"]
  },
  get CYF_PLUGIN_META_FILE() {
    return process.env["CYF_PLUGIN_META_FILE"]
  },
  get CYF_CLIENT() {
    return process.env["CYF_CLIENT"] ?? "cli"
  },
}
