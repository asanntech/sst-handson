export const router = new sst.aws.Router("Router");

export const web = new sst.aws.StaticSite("Web", {
  path: "packages/web",
  router: { instance: router },
});
