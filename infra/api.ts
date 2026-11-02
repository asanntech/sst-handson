import { router } from "./cdn";
import { allowDatabaseAccess, database } from "./database";
import { migration } from "./migrator";
import { originVerifyHeader, originVerifySecret } from "./origin-verify";
import { media } from "./storage";
import { vpc } from "./vpc";

// API タスク専用の SG。インバウンドは、ALB を作ったあとで ALB の SG からだけ許可する
const apiTaskSecurityGroup = new aws.ec2.SecurityGroup("ApiTaskSecurityGroup", {
  vpcId: vpc.id,
  description: "API tasks on Fargate",
});
// イメージの取得 (NAT 経由) と RDS への接続に使う
new aws.vpc.SecurityGroupEgressRule("ApiTaskToAnywhere", {
  securityGroupId: apiTaskSecurityGroup.id,
  ipProtocol: "-1",
  cidrIpv4: "0.0.0.0/0",
});
allowDatabaseAccess("DatabaseFromApiTask", apiTaskSecurityGroup.id);

// sst.aws.Vpc をそのまま渡すと、タスクは public サブネットに置かれパブリック IP が付く。
// オブジェクト形式で渡し、タスクを private サブネット (NAT 経由で外に出る) に置く
const cluster = new sst.aws.Cluster("Cluster", {
  vpc: {
    id: vpc.id,
    // この SG はクラスター内のすべてのサービスのタスクに付く (クラスターは API 専用)
    securityGroups: [apiTaskSecurityGroup.id],
    containerSubnets: vpc.privateSubnets,
    loadBalancerSubnets: vpc.publicSubnets,
    cloudmapNamespaceId: vpc.nodes.cloudmapNamespace.id,
    cloudmapNamespaceName: vpc.nodes.cloudmapNamespace.name,
  },
});

// CloudFront がオリジンへ接続するときの送信元 IP 範囲 (AWS が管理するプレフィックスリスト)
const cloudfrontOriginFacing = aws.ec2.getManagedPrefixListOutput({
  name: "com.amazonaws.global.cloudfront.origin-facing",
});

export const api = new sst.aws.Service("Api", {
  cluster,
  link: [database, media],
  // Apple Silicon でエミュレーションなしにビルドでき、Fargate の料金も安い
  architecture: "arm64",
  image: {
    context: ".",
    dockerfile: "packages/api/Dockerfile",
  },
  loadBalancer: {
    // 条件付きのルールだけにすると、Listener のデフォルトアクションは固定レスポンス 403 になる
    rules: [
      {
        listen: "80/http",
        forward: "3000/http",
        conditions: {
          header: {
            name: originVerifyHeader,
            values: [originVerifySecret.result],
          },
        },
      },
    ],
    health: { "3000/http": { path: "/api/health" } },
  },
  transform: {
    // migration が成功してから Service を更新する (新しいタスクが古いスキーマで動かないように)
    service: (_args, opts) => {
      opts.dependsOn = [migration];
    },
    // SST のデフォルトは全開放 (0.0.0.0/0 の全プロトコル)。CloudFront からの HTTP だけを許可する。
    // この SG は SST が Service の中で作るので、ほかの SG と違い transform でインラインのルールを書き換える
    loadBalancerSecurityGroup: (args) => {
      args.ingress = [
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          prefixListIds: [cloudfrontOriginFacing.id],
        },
      ];
    },
  },
});

new aws.vpc.SecurityGroupIngressRule("ApiTaskFromLoadBalancer", {
  securityGroupId: apiTaskSecurityGroup.id,
  referencedSecurityGroupId: api.nodes.loadBalancer.securityGroups.apply(
    (ids) => ids[0],
  ),
  ipProtocol: "tcp",
  fromPort: 3000,
  toPort: 3000,
});

// CloudFront の /api/* を ALB に振り分ける ("/api" は /api と /api/ 以下にだけ一致する)
router.route("/api", api.url);

// テストから実行中のタスクを調べるため、クラスター名とサービス名を Resource.ApiService として公開する
new sst.Linkable("ApiService", {
  properties: {
    cluster: cluster.nodes.cluster.name,
    service: api.nodes.service.name,
  },
});
