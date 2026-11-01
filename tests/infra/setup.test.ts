import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { describe, expect, test } from "vitest";

describe("0. 準備: AWS 接続先", () => {
  test("呼び出し元が dev アカウントであること", async () => {
    const sts = new STSClient({});

    const identity = await sts.send(new GetCallerIdentityCommand({}));

    expect(identity.Account).toBe(process.env.EXPECTED_AWS_ACCOUNT_ID);
  });

  test("AWS SDK のリージョンが東京 (ap-northeast-1) であること", async () => {
    const sts = new STSClient({});

    const region = await sts.config.region();

    expect(region).toBe("ap-northeast-1");
  });

  test("IAM Identity Center (SSO) の AdministratorAccess ロールの一時的な認証情報であること", async () => {
    const sts = new STSClient({});

    const identity = await sts.send(new GetCallerIdentityCommand({}));

    expect(identity.Arn).toMatch(
      /^arn:aws:sts::\d{12}:assumed-role\/AWSReservedSSO_AdministratorAccess_[0-9a-f]+\/.+$/,
    );
  });
});
