import {
  DescribeNetworkInterfacesCommand,
  DescribeRouteTablesCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import {
  DescribeTasksCommand,
  ECSClient,
  ListTasksCommand,
} from "@aws-sdk/client-ecs";
import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("2. VPC + ECS/Fargate + ALB (+ECR)", () => {
  test("ALB の URL に GET /api/health したとき 200 と {status: ok} が返ること", async () => {
    const res = await fetch(`${Resource.Api.url}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("実行中のタスクが private サブネット (IGW への経路なし) にあり、パブリック IP がないこと", async () => {
    const ecs = new ECSClient({});
    const ec2 = new EC2Client({});
    const { cluster, service } = Resource.ApiService;
    const { taskArns } = await ecs.send(
      new ListTasksCommand({
        cluster,
        serviceName: service,
        desiredStatus: "RUNNING",
      }),
    );
    const { tasks } = await ecs.send(
      new DescribeTasksCommand({ cluster, tasks: taskArns }),
    );
    const eniDetails = tasks![0].attachments!.find(
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
});
