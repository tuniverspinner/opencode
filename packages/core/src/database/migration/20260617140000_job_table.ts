import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260617140000_job_table",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`job\` (
          \`id\` text NOT NULL,
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`type\` text NOT NULL,
          \`title\` text,
          \`status\` text NOT NULL,
          \`payload\` text NOT NULL,
          \`output\` text,
          \`error\` text,
          \`metadata\` text,
          \`lease_holder\` text,
          \`lease_expires_at\` integer,
          \`started_at\` integer NOT NULL,
          \`completed_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          PRIMARY KEY (\`project_id\`, \`directory\`, \`id\`),
          CONSTRAINT \`fk_job_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`job_project_directory_idx\` ON \`job\` (\`project_id\`, \`directory\`);`)
      yield* tx.run(
        `CREATE INDEX \`job_project_directory_status_idx\` ON \`job\` (\`project_id\`, \`directory\`, \`status\`);`,
      )
      yield* tx.run(`CREATE INDEX \`job_lease_expires_idx\` ON \`job\` (\`lease_expires_at\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
