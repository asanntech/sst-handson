import {
  DescribeListenersCommand,
  DescribeLoadBalancersCommand,
  DescribeRulesCommand,
  ElasticLoadBalancingV2Client,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { Resource } from "sst";
import { describe, expect, test } from "vitest";

describe("3. CloudFront /api/* → ALB + オリジン保護", () => {
  test("CloudFront の URL に GET /api/health したとき 200 と {status: ok} が返ること", async () => {
    const res = await fetch(`${Resource.Router.url}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("クライアントが偽の X-Origin-Verify ヘッダーを付けて CloudFront 経由で GET /api/health したとき、上書きされて 200 が返ること", async () => {
    const res = await fetch(`${Resource.Router.url}/api/health`, {
      headers: { "X-Origin-Verify": "spoofed-by-client" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("ALB の URL に直接 GET /api/health したとき、接続できないか 403 が返ること", async () => {
    // SG で塞がれていると接続がタイムアウトするので、5 秒で打ち切って「接続できない」とみなす
    const status = await fetch(`${Resource.Api.url}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    }).then(
      (res) => res.status,
      () => "接続できない",
    );

    expect([403, "接続できない"]).toContain(status);
  });

  test("ALB の Listener のデフォルトアクションが固定レスポンス 403 で、X-Origin-Verify ヘッダー (英数字 32 文字) が一致したときだけ forward すること", async () => {
    const elb = new ElasticLoadBalancingV2Client({});
    // Resource.Api.url (http://<DNS 名>) から ALB を特定する。DNS 名は大文字小文字を区別しない
    const dnsName = new URL(Resource.Api.url).host.toLowerCase();
    const { LoadBalancers } = await elb.send(
      new DescribeLoadBalancersCommand({}),
    );
    const loadBalancer = LoadBalancers!.find(
      (lb) => lb.DNSName!.toLowerCase() === dnsName,
    )!;
    const { Listeners } = await elb.send(
      new DescribeListenersCommand({
        LoadBalancerArn: loadBalancer.LoadBalancerArn,
      }),
    );

    const { Rules } = await elb.send(
      new DescribeRulesCommand({ ListenerArn: Listeners![0].ListenerArn }),
    );
    const defaultRule = Rules!.find((r) => r.IsDefault)!;
    const otherRules = Rules!.filter((r) => !r.IsDefault);

    expect(Listeners).toHaveLength(1);
    expect(defaultRule.Actions).toEqual([
      expect.objectContaining({
        Type: "fixed-response",
        FixedResponseConfig: expect.objectContaining({ StatusCode: "403" }),
      }),
    ]);
    expect(otherRules).toHaveLength(1);
    expect(otherRules[0].Conditions).toEqual([
      expect.objectContaining({
        Field: "http-header",
        HttpHeaderConfig: {
          HttpHeaderName: "X-Origin-Verify",
          Values: [expect.stringMatching(/^[A-Za-z0-9]{32}$/)],
        },
      }),
    ]);
    expect(otherRules[0].Actions).toEqual([
      expect.objectContaining({ Type: "forward" }),
    ]);
  });
});
