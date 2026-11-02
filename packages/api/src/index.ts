import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: 3000 });
