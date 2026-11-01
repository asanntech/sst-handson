import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// .env (gitignore 済み) に置いたテスト用の値を process.env に読み込む
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    testTimeout: 30_000,
  },
});
