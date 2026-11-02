import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("3. CloudFront /api/* → ALB + オリジン保護", () => {
  test("CloudFront の URL に GET /api/health したとき 200 と {status: ok} が返ること", async () => {
    const res = await fetch(`${Resource.Router.url}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
