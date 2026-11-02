import { router } from "./cdn";

// 投稿画像のバケット。ブラウザは API が発行した署名付き URL で uploads/ に直接 PUT する
export const media = new sst.aws.Bucket("Media", {
  // ブラウザからの直接 PUT は、画面を配信している CloudFront のオリジンからだけ受け付ける
  cors: {
    allowOrigins: [router.url],
    allowMethods: ["PUT"],
    allowHeaders: ["content-type"],
  },
  // Router (CloudFront) からの読み取りを許可する
  access: "cloudfront",
});

// Lambda が生成したサムネイルだけを配信する。/media/thumbnails/a.png → thumbnails/a.png
router.routeBucket("/media/thumbnails", media, {
  rewrite: { regex: "^/media/(.*)$", to: "/$1" },
});
