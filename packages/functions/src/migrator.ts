import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { Resource } from "sst";

// migrations は copyFiles で関数のルート (/var/task/migrations) に同梱する
const migrationsFolder = `${process.env.LAMBDA_TASK_ROOT}/migrations`;

export async function handler(_event: { action: "migrate" }) {
  const client = new pg.Client({
    host: Resource.Database.host,
    port: Resource.Database.port,
    user: Resource.Database.username,
    password: Resource.Database.password,
    database: Resource.Database.database,
  });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder });
    const { rows } = await client.query<{ applied: number }>(
      "select count(*)::int as applied from drizzle.__drizzle_migrations",
    );
    return { applied: rows[0].applied };
  } finally {
    await client.end();
  }
}
