import { describe, expect, test, vi } from "vitest";
import { requireEnv } from "./env";

describe("テスト用の環境変数", () => {
  test("未設定のとき 変数名と .env での設定方法が分かるエラーで失敗すること", () => {
    expect(() => requireEnv("SST_HANDSON_UNSET_VAR")).toThrow(
      /SST_HANDSON_UNSET_VAR.*\.env/,
    );
  });

  test("空文字のとき (.env.example をコピーしただけ) 未設定と同じエラーで失敗すること", () => {
    vi.stubEnv("SST_HANDSON_EMPTY_VAR", "");

    expect(() => requireEnv("SST_HANDSON_EMPTY_VAR")).toThrow(
      /SST_HANDSON_EMPTY_VAR.*\.env/,
    );
  });

  test("設定済みのとき その値を返すこと", () => {
    vi.stubEnv("SST_HANDSON_SET_VAR", "123456789012");

    expect(requireEnv("SST_HANDSON_SET_VAR")).toBe("123456789012");
  });
});
