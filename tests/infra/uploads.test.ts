import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Resource } from "sst";
import { describe, expect, test } from "vitest";

// PNG のシグネチャ (8 バイト)。中身が画像として正しいかは、この章では見ない
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("5. 画像アップロード (署名付き URL)", () => {
  test("POST /api/uploads で返った署名付き URL に PUT したとき 200 が返り、uploads/ 以下に同じ Content-Type のオブジェクトができること", async () => {
    const s3 = new S3Client({});

    const issued = await fetch(`${Resource.Router.url}/api/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/png" }),
    });
    expect(issued.status).toBe(201);
    const { url, key } = (await issued.json()) as { url: string; key: string };
    expect(key).toMatch(/^uploads\/.+/);

    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "image/png" },
      body: pngBytes,
    });

    expect(put.status).toBe(200);
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: Resource.Media.name, Key: key }),
    );
    expect(head.ContentType).toBe("image/png");
  });
});
