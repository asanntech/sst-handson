import { database } from "./database";
import { vpc } from "./vpc";

// Drizzle の migration を RDS に適用する Lambda。RDS に届くよう VPC 内に置く
export const migrator = new sst.aws.Function("Migrator", {
  handler: "packages/functions/src/migrator.handler",
  vpc,
  link: [database],
  timeout: "1 minute",
  copyFiles: [{ from: "packages/core/migrations", to: "migrations" }],
});
