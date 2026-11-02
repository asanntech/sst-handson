/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "sst-handson",
      home: "aws",
      removal: "remove",
      providers: {
        aws: {
          profile: "handson-dev",
          region: "ap-northeast-1",
        },
        // オリジン保護の共有シークレットを生成する (SST 本体が使うバージョンにそろえる)
        random: "4.16.6",
      },
    };
  },
  async run() {
    await import("./infra/cdn");
    await import("./infra/database");
    await import("./infra/api");
  },
});
