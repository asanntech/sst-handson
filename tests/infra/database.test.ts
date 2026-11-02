import { DescribeSecurityGroupsCommand, EC2Client } from "@aws-sdk/client-ec2";
import { DescribeServicesCommand, ECSClient } from "@aws-sdk/client-ecs";
import {
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
} from "@aws-sdk/client-lambda";
import { DescribeDBInstancesCommand, RDSClient } from "@aws-sdk/client-rds";
import { readdirSync } from "node:fs";
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

  test("Migrator Lambda を action: status で Invoke したとき、適用済みの件数がリポジトリの migration ファイルの数と一致し、未適用が 0 件であること", async () => {
    const lambda = new LambdaClient({});
    const migrationFiles = readdirSync("packages/core/migrations").filter((f) =>
      f.endsWith(".sql"),
    );

    const res = await lambda.send(
      new InvokeCommand({
        FunctionName: Resource.Migrator.name,
        Payload: JSON.stringify({ action: "status" }),
      }),
    );
    const payload = JSON.parse(new TextDecoder().decode(res.Payload));

    expect(res.FunctionError, JSON.stringify(payload)).toBeUndefined();
    expect(migrationFiles.length).toBeGreaterThan(0);
    expect(payload).toEqual({ applied: migrationFiles.length, pending: 0 });
  }, 60_000);

  test("RDS の SG のインバウンドが、ECS タスクの SG と Migrator Lambda の SG からの TCP 5432 だけであること", async () => {
    const ec2 = new EC2Client({});
    const ecs = new ECSClient({});
    const lambda = new LambdaClient({});
    const instance = await describeTheDatabaseInstance();
    const { services } = await ecs.send(
      new DescribeServicesCommand({
        cluster: Resource.ApiService.cluster,
        services: [Resource.ApiService.service],
      }),
    );
    const { VpcConfig } = await lambda.send(
      new GetFunctionConfigurationCommand({
        FunctionName: Resource.Migrator.name,
      }),
    );
    const apiTaskSecurityGroups =
      services![0].networkConfiguration!.awsvpcConfiguration!.securityGroups!;
    const migratorSecurityGroups = VpcConfig!.SecurityGroupIds!;

    const databaseSecurityGroupIds = instance.VpcSecurityGroups!.map(
      (sg) => sg.VpcSecurityGroupId!,
    );
    const { SecurityGroups } = await ec2.send(
      new DescribeSecurityGroupsCommand({ GroupIds: databaseSecurityGroupIds }),
    );

    // ECS と Migrator がそれぞれ専用の SG を 1 つずつ持ち、RDS の SG とも別であること
    expect(apiTaskSecurityGroups).toHaveLength(1);
    expect(migratorSecurityGroups).toHaveLength(1);
    expect(SecurityGroups).toHaveLength(1);
    expect(
      new Set([
        apiTaskSecurityGroups[0],
        migratorSecurityGroups[0],
        SecurityGroups![0].GroupId,
      ]).size,
    ).toBe(3);
    expect(SecurityGroups![0].IpPermissions).toEqual([
      expect.objectContaining({
        IpProtocol: "tcp",
        FromPort: 5432,
        ToPort: 5432,
        IpRanges: [],
        Ipv6Ranges: [],
        PrefixListIds: [],
        UserIdGroupPairs: expect.arrayContaining([
          expect.objectContaining({ GroupId: apiTaskSecurityGroups[0] }),
          expect.objectContaining({ GroupId: migratorSecurityGroups[0] }),
        ]),
      }),
    ]);
    expect(SecurityGroups![0].IpPermissions![0].UserIdGroupPairs).toHaveLength(
      2,
    );
  });

  test("CloudFront 経由で POST /api/posts したあと GET /api/posts したとき、作成した投稿が一覧に含まれること", async () => {
    const body = `infra test ${crypto.randomUUID()}`;

    const created = await fetch(`${Resource.Router.url}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const listed = await fetch(`${Resource.Router.url}/api/posts`);

    expect(created.status).toBe(201);
    const post = await created.json();
    expect(post).toEqual({
      id: expect.any(Number),
      body,
      createdAt: expect.any(String),
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toContainEqual(post);
  });

  test.each([
    { case: "空文字", payload: { body: "" } },
    { case: "空白だけ", payload: { body: "   " } },
    { case: "body がない", payload: {} },
  ])("POST /api/posts で本文が「$case」のとき 400 が返ること", async ({ payload }) => {
    const res = await fetch(`${Resource.Router.url}/api/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
  });
});
