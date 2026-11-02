import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
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

  test("署名付き URL へ PUT の CORS プリフライトを送ったとき、CloudFront の URL のオリジンは許可され、ほかのオリジンは許可されないこと", async () => {
    const issued = await fetch(`${Resource.Router.url}/api/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/png" }),
    });
    const { url } = (await issued.json()) as { url: string };
    const routerOrigin = new URL(Resource.Router.url).origin;

    const fromRouter = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: routerOrigin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    const fromOther = await fetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(fromRouter.status).toBe(200);
    expect(fromRouter.headers.get("access-control-allow-origin")).toBe(
      routerOrigin,
    );
    expect(fromOther.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("thumbnails/ に置いたオブジェクトを CloudFront の /media/thumbnails/... で GET したとき 200 で中身が返ること", async () => {
    const s3 = new S3Client({});
    const name = `test-${crypto.randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.Media.name,
        Key: `thumbnails/${name}`,
        Body: pngBytes,
        ContentType: "image/png",
      }),
    );

    try {
      const res = await fetch(`${Resource.Router.url}/media/thumbnails/${name}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(pngBytes);
    } finally {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: Resource.Media.name,
          Key: `thumbnails/${name}`,
        }),
      );
    }
  });

  test("署名なしでバケットの uploads/ に PUT したとき 403 が返り、オブジェクトができないこと", async () => {
    const s3 = new S3Client({});
    const key = `uploads/test-${crypto.randomUUID()}.png`;

    const put = await fetch(
      `https://${Resource.Media.name}.s3.ap-northeast-1.amazonaws.com/${key}`,
      {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: pngBytes,
      },
    );

    expect(put.status).toBe(403);
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: Resource.Media.name, Key: key })),
    ).rejects.toMatchObject({ name: "NotFound" });
  });

  test("署名時と異なる Content-Type で署名付き URL に PUT したとき 403 が返ること", async () => {
    const issued = await fetch(`${Resource.Router.url}/api/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/png" }),
    });
    const { url } = (await issued.json()) as { url: string };

    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "text/html" },
      body: "<script>alert(1)</script>",
    });

    expect(put.status).toBe(403);
  });

  test.each([
    { case: "contentType がない", requestBody: JSON.stringify({}) },
    {
      case: "画像以外 (text/html)",
      requestBody: JSON.stringify({ contentType: "text/html" }),
    },
    {
      case: "画像だが対象外 (image/svg+xml)",
      requestBody: JSON.stringify({ contentType: "image/svg+xml" }),
    },
    { case: "JSON でない", requestBody: "not json" },
    { case: "null", requestBody: "null" },
  ])("POST /api/uploads で本文が「$case」のとき 400 が返ること", async ({ requestBody }) => {
    const res = await fetch(`${Resource.Router.url}/api/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    expect(res.status).toBe(400);
  });

  test("uploads/ のオブジェクトを CloudFront の /media/uploads/... で GET したとき、画像が返らないこと", async () => {
    const s3 = new S3Client({});
    const name = `test-${crypto.randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.Media.name,
        Key: `uploads/${name}`,
        Body: pngBytes,
        ContentType: "image/png",
      }),
    );

    try {
      const res = await fetch(`${Resource.Router.url}/media/uploads/${name}`);

      // 未知のパスは画面 (StaticSite) の HTML にフォールバックするので、ステータスではなく中身で判定する
      expect(res.headers.get("content-type")).not.toBe("image/png");
      expect(new Uint8Array(await res.arrayBuffer())).not.toEqual(pngBytes);
    } finally {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: Resource.Media.name,
          Key: `uploads/${name}`,
        }),
      );
    }
  });

  test("画像バケットのオブジェクト URL に直接 GET したとき 403 が返ること", async () => {
    const s3 = new S3Client({});
    const key = `thumbnails/test-${crypto.randomUUID()}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: Resource.Media.name,
        Key: key,
        Body: pngBytes,
        ContentType: "image/png",
      }),
    );

    try {
      const res = await fetch(
        `https://${Resource.Media.name}.s3.ap-northeast-1.amazonaws.com/${key}`,
      );

      expect(res.status).toBe(403);
    } finally {
      await s3.send(
        new DeleteObjectCommand({ Bucket: Resource.Media.name, Key: key }),
      );
    }
  });
});
