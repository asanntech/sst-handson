import {
  DescribeNetworkInterfacesCommand,
  DescribeRouteTablesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import {
  BatchGetImageCommand,
  DescribeImagesCommand,
  ECRClient,
  GetDownloadUrlForLayerCommand,
} from "@aws-sdk/client-ecr";
import {
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import { Resource } from "sst";
import { describe, expect, test } from "vitest";

// 実行中のタスクを 1 つ取得する。0 件 (起動前) や 2 件 (ローリング更新中) のときは、
// DescribeTasks のエラーや古いタスクの検証にならないよう、件数の前提で先に失敗させる
async function describeTheRunningTask() {
  const ecs = new ECSClient({});
  const { cluster, service } = Resource.ApiService;
  const { taskArns } = await ecs.send(
    new ListTasksCommand({
      cluster,
      serviceName: service,
      desiredStatus: "RUNNING",
    }),
  );
  expect(
    taskArns,
    "実行中のタスクが 1 つであること (deploy 後に aws ecs wait services-stable を待ったか)",
  ).toHaveLength(1);
  const { tasks } = await ecs.send(
    new DescribeTasksCommand({ cluster, tasks: taskArns }),
  );
  return tasks![0];
}

describe("2. VPC + ECS/Fargate + ALB (+ECR)", () => {
  test("ALB の URL に GET /api/health したとき 200 と {status: ok} が返ること", async () => {
    const res = await fetch(`${Resource.Api.url}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("実行中のタスクが private サブネット (IGW への経路なし) にあり、パブリック IP がないこと", async () => {
    const ec2 = new EC2Client({});
    const task = await describeTheRunningTask();
    const eniDetails = task.attachments!.find(
      (a) => a.type === "ElasticNetworkInterface",
    )!.details!;
    const subnetId = eniDetails.find((d) => d.name === "subnetId")!.value!;
    const eniId = eniDetails.find((d) => d.name === "networkInterfaceId")!
      .value!;

    const { RouteTables } = await ec2.send(
      new DescribeRouteTablesCommand({
        Filters: [{ Name: "association.subnet-id", Values: [subnetId] }],
      }),
    );
    const { NetworkInterfaces } = await ec2.send(
      new DescribeNetworkInterfacesCommand({ NetworkInterfaceIds: [eniId] }),
    );

    expect(RouteTables).toHaveLength(1);
    const gatewayIds = RouteTables![0].Routes!.map((r) => r.GatewayId ?? "");
    expect(gatewayIds.filter((id) => id.startsWith("igw-"))).toEqual([]);
    expect(NetworkInterfaces![0].Association?.PublicIp).toBeUndefined();
  });

  test("実行中のタスクのイメージダイジェストが ECR の SST 共有リポジトリ (sst-asset) にあること", async () => {
    const ecr = new ECRClient({});
    const task = await describeTheRunningTask();
    const container = task.containers![0];
    // 例: <account>.dkr.ecr.ap-northeast-1.amazonaws.com/sst-asset:Api@sha256:...
    const repositoryName = container.image!.split("/")[1].split(/[:@]/)[0];

    const { imageDetails } = await ecr.send(
      new DescribeImagesCommand({
        repositoryName,
        imageIds: [{ imageDigest: container.imageDigest }],
      }),
    );

    expect(repositoryName).toBe("sst-asset");
    expect(imageDetails).toHaveLength(1);
    expect(imageDetails![0].imageDigest).toBe(container.imageDigest);
  });

  test("実行中のタスクのイメージが root ではないユーザー (node) で実行される設定であること", async () => {
    const ecr = new ECRClient({});
    const task = await describeTheRunningTask();
    const { imageDigest } = task.containers![0];

    // イメージのマニフェストから設定 (config) の blob をたどり、Dockerfile の USER を読む
    const { images } = await ecr.send(
      new BatchGetImageCommand({
        repositoryName: "sst-asset",
        imageIds: [{ imageDigest }],
      }),
    );
    const manifest = JSON.parse(images![0].imageManifest!);
    const { downloadUrl } = await ecr.send(
      new GetDownloadUrlForLayerCommand({
        repositoryName: "sst-asset",
        layerDigest: manifest.config.digest,
      }),
    );
    const imageConfig = (await (await fetch(downloadUrl!)).json()) as {
      config: { User?: string };
    };

    expect(imageConfig.config.User).toBe("node");
  });

  test("ECS Service の desiredCount が 1 で、実行中のタスクが 1 つであること", async () => {
    const ecs = new ECSClient({});
    const { cluster, service } = Resource.ApiService;

    const { services } = await ecs.send(
      new DescribeServicesCommand({ cluster, services: [service] }),
    );
    const { taskArns } = await ecs.send(
      new ListTasksCommand({
        cluster,
        serviceName: service,
        desiredStatus: "RUNNING",
      }),
    );

    expect(services![0].desiredCount).toBe(1);
    expect(taskArns).toHaveLength(1);
  });
});
