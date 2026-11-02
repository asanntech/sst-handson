import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("2. VPC + ECS/Fargate + ALB (+ECR)", () => {
  test("ALB の URL に GET /api/health したとき 200 と {status: ok} が返ること", async () => {
    const res = await fetch(`${Resource.Api.url}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
