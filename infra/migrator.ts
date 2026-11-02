import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  allowDatabaseAccess,
  database,
  databaseSecurityGroup,
} from "./database";
import { vpc } from "./vpc";

const migrationsDir = join($cli.paths.root, "packages/core/migrations");

// Migrator 専用の SG。RDS に接続するためのアウトバウンドだけを持つ
const migratorSecurityGroup = new aws.ec2.SecurityGroup(
  "MigratorSecurityGroup",
  { vpcId: vpc.id, description: "Migrator Lambda" },
);
// link の値は環境変数で渡されるので、RDS 以外へ出ていく必要はない
const migratorEgress = new aws.vpc.SecurityGroupEgressRule(
  "MigratorToDatabase",
  {
    securityGroupId: migratorSecurityGroup.id,
    referencedSecurityGroupId: databaseSecurityGroup.id,
    ipProtocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
  },
);
const databaseFromMigrator = allowDatabaseAccess(
  "DatabaseFromMigrator",
  migratorSecurityGroup.id,
);

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

// migrations (SQL と journal) の内容のハッシュ。migration を追加したときだけ値が変わる
function hashMigrations() {
  const hash = createHash("sha256");
  const files = [
    ...readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")),
    "meta/_journal.json",
  ].sort();
  for (const file of files) {
    hash.update(file).update(readFileSync(join(migrationsDir, file)));
  }
  return hash.digest("hex");
}

// deploy 中に Migrator を 1 回呼ぶ。Invocation は input (migrations の内容と DB) が変わったときだけ作り直され、再実行される。
// 関数がエラーを返すと Invocation の作成が失敗し、これに依存する ECS Service は更新されない。
// SG のルールは関数とは別リソースなので、Migrator から RDS に届く状態になるまで明示的に待つ
export const migration = new aws.lambda.Invocation(
  "Migration",
  {
    functionName: migrator.name,
    input: $jsonStringify({
      action: "migrate",
      migrations: hashMigrations(),
      // DB が作り直されたら (エンドポイントが変わったら)、空の DB に migrate をやり直す
      database: database.host,
    }),
  },
  { dependsOn: [migratorEgress, databaseFromMigrator] },
);
