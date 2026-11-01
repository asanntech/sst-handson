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
});
