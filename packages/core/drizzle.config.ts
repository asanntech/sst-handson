import { defineConfig } from "drizzle-kit";

// migration の生成 (drizzle-kit generate) だけに使う。DB には接続しない
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
});
