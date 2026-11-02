import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { DescribeDBInstancesCommand, RDSClient } from "@aws-sdk/client-rds";
import { Resource } from "sst";
import { describe, expect, test } from "vitest";

// Resource.Database.host (RDS のエンドポイント) から DB インスタンスを特定する
async function describeTheDatabaseInstance() {
  const rds = new RDSClient({});
  const { DBInstances } = await rds.send(new DescribeDBInstancesCommand({}));
  const instance = DBInstances!.find(
    (db) => db.Endpoint?.Address === Resource.Database.host,
  );
  expect(
    instance,
    `${Resource.Database.host} の DB インスタンスが存在すること`,
  ).toBeDefined();
  return instance!;
}

describe("4. RDS + Drizzle", () => {
  test("RDS が PubliclyAccessible=false で、ストレージが暗号化されていること", async () => {
    const instance = await describeTheDatabaseInstance();

    expect(instance.PubliclyAccessible).toBe(false);
    expect(instance.StorageEncrypted).toBe(true);
  });

  test("Migrator Lambda を action: migrate で 2 回続けて Invoke したとき、どちらも関数エラーなしで成功し、適用済みの件数が変わらないこと", async () => {
    const lambda = new LambdaClient({});
    const invokeMigrate = async () => {
      const res = await lambda.send(
        new InvokeCommand({
          FunctionName: Resource.Migrator.name,
          Payload: JSON.stringify({ action: "migrate" }),
        }),
      );
      return {
        functionError: res.FunctionError,
        payload: JSON.parse(new TextDecoder().decode(res.Payload)),
      };
    };

    const first = await invokeMigrate();
    const second = await invokeMigrate();

    expect(first.functionError, JSON.stringify(first.payload)).toBeUndefined();
    expect(first.payload).toEqual({ applied: expect.any(Number) });
    expect(second.functionError, JSON.stringify(second.payload)).toBeUndefined();
    expect(second.payload).toEqual(first.payload);
  }, 60_000);
});
