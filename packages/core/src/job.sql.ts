import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core"
import * as DatabasePath from "./database/path"
import { Timestamps } from "./database/schema.sql"
import { ProjectTable } from "./project/sql"
import { ProjectV2 } from "./project"
import type { BackgroundJob } from "./background-job"

export const JobTable = sqliteTable(
  "job",
  {
    id: text().notNull(),
    project_id: text()
      .$type<ProjectV2.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    directory: DatabasePath.directoryColumn().notNull(),
    type: text().notNull(),
    title: text(),
    status: text().$type<BackgroundJob.Status>().notNull(),
    payload: text({ mode: "json" }).notNull(),
    output: text(),
    error: text(),
    metadata: text({ mode: "json" }),
    lease_holder: text(),
    lease_expires_at: integer(),
    started_at: integer().notNull(),
    completed_at: integer(),
    ...Timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.project_id, table.directory, table.id] }),
    index("job_project_directory_idx").on(table.project_id, table.directory),
    index("job_project_directory_status_idx").on(table.project_id, table.directory, table.status),
    index("job_lease_expires_idx").on(table.lease_expires_at),
  ],
)
