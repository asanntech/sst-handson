import { serve } from "@hono/node-server";
import { posts } from "@sst-handson/core/schema";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import pg from "pg";
import { Resource } from "sst";

const db = drizzle(
  new pg.Pool({
    host: Resource.Database.host,
    port: Resource.Database.port,
    user: Resource.Database.username,
    password: Resource.Database.password,
    database: Resource.Database.database,
  }),
);

const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" }));

// 新しい順に最大 100 件
app.get("/api/posts", async (c) =>
  c.json(await db.select().from(posts).orderBy(desc(posts.id)).limit(100)),
);

app.post("/api/posts", async (c) => {
  const { body } = await c.req.json<{ body: string }>();
  const [post] = await db.insert(posts).values({ body }).returning();
  return c.json(post, 201);
});

serve({ fetch: app.fetch, port: 3000 });
