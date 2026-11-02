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
});
