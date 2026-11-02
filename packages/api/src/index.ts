import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serve } from "@hono/node-server";
import { posts } from "@sst-handson/core/schema";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Hono } from "hono";
import pg from "pg";
import { Resource } from "sst";

const pool = new pg.Pool({
  host: Resource.Database.host,
  port: Resource.Database.port,
  user: Resource.Database.username,
  password: Resource.Database.password,
  database: Resource.Database.database,
  // RDS に届かないとき、ALB のタイムアウトまで待たずにエラーで返す
  connectionTimeoutMillis: 5_000,
});
// RDS の再起動などでアイドル中の接続が切れると、Pool は error イベントを出す。
// リスナーがないとプロセスが落ちるので、ログに残すだけにする (次のクエリで新しい接続が作られる)
pool.on("error", (err) => console.error("idle database client error", err));
const db = drizzle(pool);

const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" }));

// 新しい順に最大 100 件
app.get("/api/posts", async (c) =>
  c.json(await db.select().from(posts).orderBy(desc(posts.id)).limit(100)),
);

app.post("/api/posts", async (c) => {
  // JSON として読めない本文や null も、入力の誤りとして 400 にする
  const input: unknown = await c.req.json().catch(() => null);
  const body =
    typeof input === "object" && input !== null && "body" in input
      ? input.body
      : undefined;
  if (typeof body !== "string" || body.trim() === "") {
    return c.json({ error: "body is required" }, 400);
  }
  const [post] = await db.insert(posts).values({ body }).returning();
  return c.json(post, 201);
});

const s3 = new S3Client({});

app.post("/api/uploads", async (c) => {
  const { contentType } = await c.req.json();
  const key = `uploads/${crypto.randomUUID()}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: Resource.Media.name,
      Key: key,
      ContentType: contentType,
    }),
    // 既定では host しか署名されないので、Content-Type を署名に含めて違う種類のファイルを置かせない
    { expiresIn: 300, signableHeaders: new Set(["content-type"]) },
  );
  return c.json({ url, key }, 201);
});

serve({ fetch: app.fetch, port: 3000 });
