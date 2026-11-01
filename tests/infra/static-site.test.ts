import { GetPublicAccessBlockCommand, S3Client } from "@aws-sdk/client-s3";
import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("1. S3 + CloudFront (静的サイト)", () => {
  test("CloudFront の URL に GET したとき 200 と text/html の index.html が返ること", async () => {
    const res = await fetch(Resource.Web.url);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await res.text()).toContain("<title>sst-handson</title>");
  });

  test("アセットバケットのパブリックアクセスブロックが 4 項目すべて有効なこと", async () => {
    const s3 = new S3Client({});

    const { PublicAccessBlockConfiguration } = await s3.send(
      new GetPublicAccessBlockCommand({ Bucket: Resource.WebAssets.name }),
    );

    expect(PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true,
    });
  });
});
