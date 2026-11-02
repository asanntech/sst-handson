import { originVerifyHeader, originVerifySecret } from "./origin-verify";

// /api 宛てのリクエストにだけ共有シークレットのヘッダーを付ける。クライアントが同名のヘッダーを送っても上書きする。
// viewer-request で付けたヘッダーは、Router の Origin Request Policy (AllViewerExceptHostHeader) でオリジンに転送される
export const router = new sst.aws.Router("Router", {
  edge: {
    viewerRequest: {
      injection: $interpolate`
  if (event.request.uri === "/api" || event.request.uri.startsWith("/api/")) {
    event.request.headers["${originVerifyHeader.toLowerCase()}"] = { value: "${originVerifySecret.result}" };
  }`,
    },
  },
});

export const web = new sst.aws.StaticSite("Web", {
  path: "packages/web",
  router: { instance: router },
});

// テストからアセットバケットを参照するため、バケット名を Resource.WebAssets として公開する
new sst.Linkable("WebAssets", {
  properties: { name: web.nodes.assets!.name },
});
