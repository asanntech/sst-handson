export const router = new sst.aws.Router("Router");

export const web = new sst.aws.StaticSite("Web", {
  path: "packages/web",
  router: { instance: router },
});

// テストからアセットバケットを参照するため、バケット名を Resource.WebAssets として公開する
new sst.Linkable("WebAssets", {
  properties: { name: web.nodes.assets!.name },
});
