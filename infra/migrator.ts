import { allowDatabaseAccess, database } from "./database";
import { vpc } from "./vpc";

// Migrator 専用の SG。RDS に接続するためのアウトバウンドだけを持つ
const migratorSecurityGroup = new aws.ec2.SecurityGroup(
  "MigratorSecurityGroup",
  {
    vpcId: vpc.id,
    description: "Migrator Lambda",
    egress: [
      { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
    ],
  },
);
allowDatabaseAccess("DatabaseFromMigrator", migratorSecurityGroup.id);

// Drizzle の migration を RDS に適用する Lambda。RDS に届くよう VPC 内に置く
export const migrator = new sst.aws.Function("Migrator", {
  handler: "packages/functions/src/migrator.handler",
  vpc: {
    privateSubnets: vpc.privateSubnets,
    securityGroups: [migratorSecurityGroup.id],
  },
  link: [database],
  timeout: "1 minute",
  copyFiles: [{ from: "packages/core/migrations", to: "migrations" }],
});
