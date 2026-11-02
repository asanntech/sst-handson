// 投稿画像のバケット。ブラウザは API が発行した署名付き URL で uploads/ に直接 PUT する
export const media = new sst.aws.Bucket("Media");
