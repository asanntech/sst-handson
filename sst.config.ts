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
      },
    };
  },
  async run() {},
});
