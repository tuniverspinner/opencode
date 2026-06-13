import { SessionV2 } from "@cyf-ai/core/session"
import { LocationServiceMap } from "@cyf-ai/core/location-layer"
import { PermissionSaved } from "@cyf-ai/core/permission/saved"
import { Layer } from "effect"
import { layer as v2LocationLayer } from "./groups/v2/location"
import { messageHandlers } from "./handlers/v2/message"
import { modelHandlers } from "./handlers/v2/model"
import { providerHandlers } from "./handlers/v2/provider"
import { sessionHandlers } from "./handlers/v2/session"
import { permissionHandlers, savedPermissionHandlers, sessionPermissionHandlers } from "./handlers/v2/permission"
import { fileSystemHandlers } from "./handlers/v2/fs"
import { commandHandlers } from "./handlers/v2/command"
import { skillHandlers } from "./handlers/v2/skill"
import { eventHandlers } from "./handlers/v2/event"
import { agentHandlers } from "./handlers/v2/agent"
import { healthHandlers } from "./handlers/v2/health"
import { questionHandlers, sessionQuestionHandlers } from "./handlers/v2/question"
import { Database } from "@cyf-ai/core/database/database"
import { EventV2 } from "@cyf-ai/core/event"
import { ProjectV2 } from "@cyf-ai/core/project"
import * as SessionExecutionLocal from "@cyf-ai/core/session/execution/local"
import { SessionProjector } from "@cyf-ai/core/session/projector"
import { SessionStore } from "@cyf-ai/core/session/store"

const routedSessions = SessionV2.layer.pipe(
  Layer.provide(SessionProjector.layer),
  Layer.provide(SessionExecutionLocal.layer),
  Layer.provide(LocationServiceMap.layer),
  Layer.provide(SessionStore.layer),
  Layer.provide(EventV2.layer),
  Layer.provide(Database.defaultLayer),
  Layer.provide(ProjectV2.defaultLayer),
  Layer.orDie,
)

export const v2Handlers = Layer.mergeAll(
  healthHandlers,
  agentHandlers,
  sessionHandlers,
  messageHandlers,
  modelHandlers,
  providerHandlers,
  permissionHandlers,
  sessionPermissionHandlers,
  savedPermissionHandlers,
  fileSystemHandlers,
  commandHandlers,
  skillHandlers,
  eventHandlers,
  questionHandlers,
  sessionQuestionHandlers,
).pipe(
  Layer.provide(v2LocationLayer),
  Layer.provide(LocationServiceMap.layer),
  Layer.provide(PermissionSaved.layer),
  Layer.provide(routedSessions),
)
