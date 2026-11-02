import { vpc } from "./vpc";

// 最小サイズ・単一 AZ。sst.aws.Vpc を渡すと private サブネットに置かれる
export const database = new sst.aws.Postgres("Database", {
  vpc,
  instance: "t4g.micro",
});
