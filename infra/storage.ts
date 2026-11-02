import { router } from "./cdn";

// 投稿画像のバケット。ブラウザは API が発行した署名付き URL で uploads/ に直接 PUT する
export const media = new sst.aws.Bucket("Media", {
  // ブラウザからの直接 PUT は、画面を配信している CloudFront のオリジンからだけ受け付ける
  cors: {
    allowOrigins: [router.url],
    allowMethods: ["PUT"],
    allowHeaders: ["content-type"],
  },
  // 読み取りを許可するのは、この Router のディストリビューションからの thumbnails/ だけ。
  // access: "cloudfront" だとバケット全体が対象になり、ほかのディストリビューションも条件なしで許可される
  policy: [
    {
      actions: ["s3:GetObject"],
      principals: [
        { type: "service", identifiers: ["cloudfront.amazonaws.com"] },
      ],
      paths: ["thumbnails/*"],
      conditions: [
        {
          test: "StringEquals",
          variable: "AWS:SourceArn",
          values: [router.nodes.cdn.nodes.distribution.arn],
        },
      ],
    },
  ],
});

// Lambda が生成したサムネイルだけを配信する。/media/thumbnails/a.png → thumbnails/a.png
router.routeBucket("/media/thumbnails", media, {
  rewrite: { regex: "^/media/(.*)$", to: "/$1" },
});
