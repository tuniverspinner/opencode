import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("CYF_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@opencode/RuntimeFlags", {
  autoShare: bool("CYF_AUTO_SHARE"),
  pure: bool("CYF_PURE"),
  disableDefaultPlugins: bool("CYF_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("CYF_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("CYF_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("CYF_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("CYF_DISABLE_CLAUDE_CODE"),
    direct: bool("CYF_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("CYF_DISABLE_CLAUDE_CODE"),
    direct: bool("CYF_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("CYF_ENABLE_EXA"),
    legacy: bool("CYF_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("CYF_ENABLE_PARALLEL"),
    legacy: bool("CYF_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("CYF_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("CYF_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("CYF_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("CYF_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("CYF_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("CYF_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("CYF_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("CYF_EXPERIMENTAL_PLAN_MODE"),
  experimentalEventSystem: enabledByExperimental("CYF_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("CYF_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("CYF_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("CYF_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("CYF_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("CYF_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("CYF_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("CYF_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.defaultLayer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const defaultLayer = Service.defaultLayer.pipe(Layer.orDie)

export * as RuntimeFlags from "./runtime-flags"
