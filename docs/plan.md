# SST v3 インフラ構築ハンズオン 計画

## 1. 目的と前提

| 項目 | 決定 |
| --- | --- |
| 対象者 | 自分ひとりの学習用 |
| 主題 | **インフラ構築**。アプリケーションは各サービスをつなぐための最小限の実装にとどめる |
| IaC | SST v3 (Ion / Pulumi ベース)。高レベルコンポーネントで書けないものは `aws.*` (Pulumi) で直接書く |
| 進め方 | `/tdd` を使い、**インフラに対して** Red → Green を回す |
| 題材アプリ | 投稿アプリ（テキストと画像の投稿、サムネイル生成） |
| 言語 | TypeScript (pnpm モノレポ)。API は Hono |
| AWS | 東京リージョン (ap-northeast-1)。WAF だけ us-east-1。認証は IAM Identity Center (SSO) の一時的な認証情報を使う |
| ステージ | `dev` のみ |
| コスト方針 | 使う日だけ `sst deploy` し、終わったら `sst remove`。どのリソースも最小サイズにする |

## 2. 対象サービス (14)

CloudFront / S3 / Fargate / ECS / ECR / EventBridge / SQS / Lambda / RDS / IAM / WAF / VPC / CloudWatch / ALB

### 対象外にしたもの

| サービス | 理由 |
| --- | --- |
| Route53 / Certificate Manager | 独自ドメインを用意しないため。CloudFront のデフォルトドメイン (`*.cloudfront.net`) を使う |
| OpenSearch | 作成に時間がかかり、コストも高いので今回は見送る。検索は RDS (Postgres) の ILIKE や全文検索で代用する |
| GuardDuty | アカウント単位の設定なので、毎回 deploy/remove する運用と合わない。今回は見送る |

## 3. 全体構成

```
Browser ─HTTPS→ CloudFront (*.cloudfront.net) ← WAF (us-east-1: レート制限 + IP許可リスト)
  ├ /*         → S3 (静的サイト: 素の HTML 1 枚, OAC)
  ├ /media/*   → S3 (画像バケット thumbnails/, OAC)
  └ /api/*  ─HTTP→ ALB (public subnet)
                    SG: CloudFront origin-facing のマネージドプレフィックスリストだけ許可
                    Listener: X-Origin-Verify ヘッダーが一致したときだけ forward、それ以外は 403
                    → ECS on Fargate (private subnet, タスク数 1, イメージは SST が ECR に push)
                         ├→ RDS for PostgreSQL t4g.micro (private subnet, 単一 AZ)
                         └ 画像アップロード用の署名付き PUT URL を発行

Browser ─PUT(署名付き URL)→ S3 画像バケット uploads/
  └ Object Created → EventBridge (default bus) → ルール (bucket と prefix uploads/ で絞る)
                       → SQS (+DLQ) → Lambda (VPC 内, sharp でリサイズ)
                                         ├→ S3 thumbnails/
                                         └→ RDS posts.thumbnail_key を更新

sst deploy ─ aws.lambda.Invocation → Migrator Lambda (VPC 内, Drizzle migrate) → RDS
              └ 成功したら ECS Service を更新する (dependsOn)

VPC: sst.aws.Vpc { nat: "ec2" }  public / private
     S3 Gateway エンドポイント (無料)
CloudWatch: ECS, Lambda, WAF のログ (保持期間を設定し、Logs Insights で調べる)
```

### 主な設計判断

| 論点 | 決定 | 理由 |
| --- | --- | --- |
| 入口 | CloudFront を 1 つだけ置き、パスでオリジンを振り分ける | CORS を不要にし、WAF を 1 か所にまとめる |
| オリジン保護 | ALB の SG をプレフィックスリストに限定し、加えてカスタムヘッダーの共有シークレットを検証する | ドメインがないので ALB は HTTP で公開される。WAF を迂回されないようにする |
| 非同期処理 | 画像サムネイル生成 (S3 → EventBridge → SQS → Lambda) | S3、EventBridge、SQS、Lambda、IAM、VPC が自然につながる |
| EventBridge の用途 | S3 イベントのルーティング (Cron は使わない) | イベントパターンでのフィルタリングと、ターゲットへの配送を学ぶ |
| RDS | RDS for PostgreSQL t4g.micro。Lambda も VPC 内に置く | 安価で、SG による通信制御を学べる |
| ORM / migration | Drizzle。deploy 中に **Migrator Lambda** を `aws.lambda.Invocation` で 1 回だけ呼び、成功してから ECS Service を更新する (`dependsOn`) | 実務で主流の「デプロイ工程の中で、アプリ更新の前に実行する」形にする。タスク数に関係なく競合せず、migration に失敗したらアプリは更新されない |
| スキーマ変更の進め方 | expand / contract (後方互換のある変更だけを先に入れる) | ローリングデプロイ中は新旧のタスクが同じ DB にアクセスするため |
| ECR | SST の自動ビルドと push に任せる。仕組みはテストで確かめる | 構築の手間を最小にする |
| WAF | レート制限と IP 許可リストだけ (マネージドルールは使わない) | 学習用の環境を外部から使われないようにする |
| CloudWatch | ログだけ (保持期間と Logs Insights)。アラームとダッシュボードは作らない | 対象範囲を絞る |
| API の認証 | なし (WAF の IP 許可リストで守る) | インフラ構築に集中する |
| フロントエンド | 素の HTML 1 枚 (fetch で投稿、アップロード、一覧表示) | つながりを目で確認できれば十分 |
| アプリのテスト | 作らない | 主題はインフラ構築 |

## 4. リポジトリ構成 (予定)

```
sst.config.ts
infra/
  vpc.ts  storage.ts  database.ts  api.ts  cdn.ts  thumbnail.ts  waf.ts
packages/
  api/          # Hono + Drizzle, Dockerfile
  functions/    # thumbnail Lambda, migrator Lambda
  core/         # Drizzle スキーマと migrations (api, thumbnail, migrator で共有)
  web/          # index.html
tests/infra/    # Vitest + AWS SDK (`sst shell -- vitest` で Resource を参照する)
docs/
```

## 5. TDD の方針 (インフラ)

- 各章でまず **deploy 後の振る舞いを検証するテスト** を書いて Red を確認する。次に `sst deploy` して Green にする。
- テストでは Vitest と AWS SDK v3、fetch を使う。URL やリソース名は `sst shell` 経由で `Resource.*` から取得する。
- Pulumi のモックを使った定義のユニットテストは作らない。
- 実行例: `pnpm sst shell --stage dev -- vitest run tests/infra/<章>.test.ts`

## 6. 章立てと各章のインフラテスト

### 0. 準備
- SST の初期化、`sst.config.ts` (`home: "aws"`, `removal: "remove"`, profile)、Vitest の土台を用意する
- SSO プロファイルを設定する (`aws configure sso` / `aws sso login`)
- テスト: `sts:GetCallerIdentity` で想定どおりのアカウントとリージョンになっていること

### 1. S3 + CloudFront (静的サイト)
- `sst.aws.StaticSite` または `sst.aws.Router` と S3 で index.html を配信する
- テスト
  - CloudFront の URL に GET すると 200 が返り、HTML が返ること
  - S3 バケットのパブリックアクセスブロックがすべて有効なこと (直接アクセスは 403)

### 2. VPC + ECS/Fargate + ALB (+ECR)
- `sst.aws.Vpc { nat: "ec2" }`、`sst.aws.Cluster`、`sst.aws.Service` (タスク数 1) を作る
- Hono で `/api/health` を実装する
- テスト
  - ALB 経由で `/api/health` が 200 を返すこと (この章の時点では ALB に直接アクセスする)
  - タスクが private サブネットにあり、パブリック IP がないこと
  - 実行中のタスクのイメージダイジェストが、ECR の SST 共有リポジトリにあるイメージと一致すること

### 3. CloudFront `/api/*` → ALB + オリジン保護
- Router に `/api/*` → ALB を追加する。オリジンリクエストにカスタムヘッダーを付ける
- ALB の SG を CloudFront のプレフィックスリストに限定する。Listener のデフォルトは 403 にし、ヘッダーが一致したときだけ forward する
- テスト
  - CloudFront 経由で `/api/health` が 200 を返すこと
  - ALB に直接アクセスすると接続できないか、403 になること

### 4. RDS + Drizzle
- `sst.aws.Postgres` (t4g.micro) を作り、Service に `link` する
- Migrator Lambda (VPC 内, `link: [db]`, `copyFiles` で migrations を同梱) を作る。`aws.lambda.Invocation` で deploy 中に呼び、Service に `dependsOn` を付ける
  - Invocation は `input` が変わったときだけ再実行される。`input` に migrations ディレクトリのハッシュを入れ、migration を追加したときだけ実行させる
  - Lambda の処理が失敗したら例外を投げ、deploy を失敗させる (このとき ECS は更新されない)
- 投稿の作成 API と一覧 API を用意する
- テスト
  - RDS が `PubliclyAccessible=false` で、暗号化されていること
  - RDS の SG のインバウンドが、ECS と Lambda (Migrator と、のちの thumbnail) の SG だけであること
  - Migrator Lambda を直接 Invoke しても成功すること (冪等であり、適用済みの migration は再実行されない)
  - `__drizzle_migrations` の件数が、リポジトリにある migration ファイルの数と一致すること (Migrator を `action: "status"` で Invoke して確認する)
  - `POST /api/posts` → `GET /api/posts` で投稿が取得できること (= migration が適用されている)

### 5. 画像アップロード (署名付き URL)
- 画像用の `sst.aws.Bucket` を作り、CORS を設定する。`POST /api/uploads` で署名付き PUT URL を返す
- Router に `/media/*` → 画像バケットを追加する
- テスト
  - 署名付き URL への PUT が成功し、`uploads/` にオブジェクトができること
  - 署名なしの PUT は拒否されること

### 6. S3 → EventBridge → SQS → Lambda (サムネイル生成)
- バケット通知で EventBridge を有効にし (`aws.s3.BucketNotification { eventbridge: true }`)、`aws.cloudwatch.EventRule` と Target、SQS のキューポリシーを設定する
- `sst.aws.Queue` に DLQ を付け、`subscribe` で Lambda (VPC 内、sharp、arm64) につなぐ
- テスト
  - 画像を PUT すると、60 秒以内に `thumbnails/` ができ、`posts.thumbnail_key` が更新されること (API で確認する)
  - `/media/thumbnails/...` を CloudFront 経由で取得できること
  - `uploads/` 以外のプレフィックスに置いたオブジェクトは処理されないこと (ルールのフィルタ)
  - 壊れた画像を置くと、リトライ後に DLQ へ入ること

### 7. WAF
- us-east-1 の provider で WebACL を作る (scope: CLOUDFRONT)。デフォルトのアクションは Block にし、自分の IP の IPSet だけ Allow する。`/api/*` にはレート制限を付ける
- Router の CDN に `webAclId` を設定する
- テスト
  - WebACL が CloudFront ディストリビューションに関連付けられていること
  - デフォルトのアクションが Block で、IPSet に自分の IP が含まれていること (SDK で確認する)
  - 自分の IP からは 200 が返ること
  - レート制限を超えると 403 になること (自分の IP が一定時間ブロックされるので、**この章の最後に実行する**)

### 8. IAM の最小権限と CloudWatch Logs
- `link` によって付与される権限を確認し、Lambda や ECS タスクロールの権限が過剰であれば `permissions` で絞る
- ECS、Lambda、WAF のロググループに保持期間を設定する (WAF のログは us-east-1 の `aws-waf-logs-*` に出す)
- テスト
  - `iam:SimulatePrincipalPolicy` で、thumbnail Lambda が `thumbnails/` 以外に書き込めず、`s3:DeleteObject` もできないこと
  - 各ロググループに保持期間が設定されていること
  - Logs Insights でサムネイル処理のログを検索できること

### 9. 後片付け
- `sst remove --stage dev`
- テスト / 確認
  - タグ (`sst:app`, `sst:stage`) が付いたリソースが残っていないこと
  - RDS の最終スナップショットや、us-east-1 の WAF、ロググループが残っていないこと
  - 意図して残すもの: SST の state バケット、共有 ECR リポジトリ (イメージは必要に応じて削除する)

## 7. コスト (目安)

| リソース | 常時稼働させた場合の月額 | 備考 |
| --- | --- | --- |
| ALB | 約 $20 | 時間単位で課金 |
| RDS t4g.micro | 約 $15 | 時間単位で課金 |
| Fargate 0.25vCPU/0.5GB × 1 | 約 $10 | |
| NAT (ec2) | 約 $3 | |
| WAF | WebACL $5 + ルール $1 × 2 | 日割り |
| その他 (CloudFront/S3/SQS/Lambda/Logs) | ほぼ $0 | 無料枠の範囲内 |

使う日だけ deploy する運用なら、月に数ドル〜十数ドル程度の見込み。

## 8. 実装時に調べること

- `sst.aws.Service` の ALB Listener と SG を `transform` でどこまで差し替えられるか (デフォルトアクションを 403 にする、プレフィックスリストに限定する)
- `sst.aws.Router` に StaticSite、Bucket、Service の URL をぶら下げる書き方と、`webAclId` の設定箇所
- `sst.aws.Postgres` を remove したときに最終スナップショットが残らないか
- sharp を Lambda (arm64) にバンドルする方法 (`nodejs.install`)
- `aws.lambda.Invocation` の再実行条件 (`input` / `triggers`) と、Lambda がエラーを返したときに deploy が失敗するか
- Migrator Lambda に Drizzle の migrations フォルダを同梱する方法 (`copyFiles`) と、Lambda 上での参照パス
