// CloudFront が /api/* のオリジンリクエストに付け、ALB が一致を確かめる共有シークレット。
// ALB のヘッダー条件は * と ? をワイルドカードとして扱うため、記号は含めない
export const originVerifyHeader = "X-Origin-Verify";

export const originVerifySecret = new random.RandomPassword(
  "OriginVerifySecret",
  { length: 32, special: false },
);
