import { vpc } from "./vpc";

// RDS 専用の SG。インバウンドは、RDS に接続するリソースの側で allowDatabaseAccess を呼んで足す
export const databaseSecurityGroup = new aws.ec2.SecurityGroup(
  "DatabaseSecurityGroup",
  { vpcId: vpc.id, description: "Postgres on RDS" },
);

// 最小サイズ・単一 AZ。sst.aws.Vpc を渡すと private サブネットに置かれる
export const database = new sst.aws.Postgres("Database", {
  vpc,
  instance: "t4g.micro",
  transform: {
    // SST のデフォルトでは VPC のデフォルト SG (VPC CIDR からの全通信を許可) が付く
    instance: (args) => {
      args.vpcSecurityGroupIds = [databaseSecurityGroup.id];
    },
  },
});

// sourceSecurityGroupId の SG から RDS への TCP 5432 を許可する
export function allowDatabaseAccess(
  name: string,
  sourceSecurityGroupId: $util.Input<string>,
) {
  return new aws.vpc.SecurityGroupIngressRule(name, {
    securityGroupId: databaseSecurityGroup.id,
    referencedSecurityGroupId: sourceSecurityGroupId,
    ipProtocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
  });
}
