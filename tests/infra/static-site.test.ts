import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("1. S3 + CloudFront (静的サイト)", () => {
  test("CloudFront の URL に GET したとき 200 と text/html の index.html が返ること", async () => {
    const res = await fetch(Resource.Web.url);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await res.text()).toContain("<title>sst-handson</title>");
  });
});
