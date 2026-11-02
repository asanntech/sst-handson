import { vpc } from "./vpc";

const cluster = new sst.aws.Cluster("Cluster", { vpc });

export const api = new sst.aws.Service("Api", {
  cluster,
  // Apple Silicon でエミュレーションなしにビルドでき、Fargate の料金も安い
  architecture: "arm64",
  image: {
    context: ".",
    dockerfile: "packages/api/Dockerfile",
  },
  loadBalancer: {
    rules: [{ listen: "80/http", forward: "3000/http" }],
    health: { "3000/http": { path: "/api/health" } },
  },
});
