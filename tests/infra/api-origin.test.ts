import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("3. CloudFront /api/* → ALB + オリジン保護", () => {
  test("CloudFront の URL に GET /api/health したとき 200 と {status: ok} が返ること", async () => {
    const res = await fetch(`${Resource.Router.url}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("ALB の URL に直接 GET /api/health したとき、接続できないか 403 が返ること", async () => {
    // SG で塞がれていると接続がタイムアウトするので、5 秒で打ち切って「接続できない」とみなす
    const status = await fetch(`${Resource.Api.url}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    }).then(
      (res) => res.status,
      () => "接続できない",
    );

    expect([403, "接続できない"]).toContain(status);
  });
});
