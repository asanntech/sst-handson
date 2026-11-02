import { vpc } from "./vpc";

// sst.aws.Vpc をそのまま渡すと、タスクは public サブネットに置かれパブリック IP が付く。
// オブジェクト形式で渡し、タスクを private サブネット (NAT 経由で外に出る) に置く
const cluster = new sst.aws.Cluster("Cluster", {
  vpc: {
    id: vpc.id,
    securityGroups: vpc.securityGroups,
    containerSubnets: vpc.privateSubnets,
    loadBalancerSubnets: vpc.publicSubnets,
    cloudmapNamespaceId: vpc.nodes.cloudmapNamespace.id,
    cloudmapNamespaceName: vpc.nodes.cloudmapNamespace.name,
  },
});

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

// テストから実行中のタスクを調べるため、クラスター名とサービス名を Resource.ApiService として公開する
new sst.Linkable("ApiService", {
  properties: {
    cluster: cluster.nodes.cluster.name,
    service: api.nodes.service.name,
  },
});
