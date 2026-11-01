import {
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

  test("S3 のオブジェクト URL に直接 GET したとき 403 が返ること", async () => {
    const s3 = new S3Client({});
    const bucket = Resource.WebAssets.name;
    // オブジェクトが存在することを確かめ、「無いから 403」と区別する
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: "index.html" }));

    const res = await fetch(
      `https://${bucket}.s3.ap-northeast-1.amazonaws.com/index.html`,
    );

    expect(res.status).toBe(403);
  });
});
