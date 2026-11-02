import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readFileSync } from "node:fs";
import pg from "pg";
import { Resource } from "sst";

// migrations は copyFiles で関数のルート (/var/task/migrations) に同梱する
const migrationsFolder = `${process.env.LAMBDA_TASK_ROOT}/migrations`;

// migrate: 未適用の migration を適用する (適用済みのものは再実行されない)
// status: 何も適用せず、適用済みと未適用の件数だけを返す
export async function handler(event: { action: "migrate" | "status" }) {
  const client = new pg.Client({
    host: Resource.Database.host,
    port: Resource.Database.port,
    user: Resource.Database.username,
    password: Resource.Database.password,
    database: Resource.Database.database,
    // RDS に届かないとき、Lambda のタイムアウト (1 分) まで待たずに原因の分かるエラーで失敗させる
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    if (event.action === "migrate") {
      await migrate(drizzle(client), { migrationsFolder });
      return { applied: await countApplied(client) };
    }
    // await しないと、クエリが終わる前に finally で接続を閉じてしまう
    return await status(client);
  } finally {
    await client.end();
  }
}

async function countApplied(client: pg.Client) {
  const { rows } = await client.query<{ applied: number }>(
    "select count(*)::int as applied from drizzle.__drizzle_migrations",
  );
  return rows[0].applied;
}

// Drizzle は適用した migration の journal の when を created_at に記録する。
// 同梱している journal のうち、created_at にないものを未適用とみなす
async function status(client: pg.Client) {
  const journal = JSON.parse(
    readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"),
  ) as { entries: { when: number }[] };
  const { rows } = await client.query<{ created_at: string }>(
    "select created_at from drizzle.__drizzle_migrations",
  );
  const appliedAt = new Set(rows.map((r) => Number(r.created_at)));

  return {
    applied: rows.length,
    pending: journal.entries.filter((e) => !appliedAt.has(e.when)).length,
  };
}
