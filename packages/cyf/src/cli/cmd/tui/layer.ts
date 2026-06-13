import { Layer } from "effect"
import { TuiConfig } from "./config/tui"
import { Npm } from "@cyf-ai/core/npm"
import { Observability } from "@cyf-ai/core/effect/observability"

export const CliLayer = Observability.layer.pipe(Layer.merge(TuiConfig.layer), Layer.provide(Npm.defaultLayer))
