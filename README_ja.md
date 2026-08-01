# UNCHAINED Status Page

**[English](./README.md) | 日本語**

`https://status.unchained.co.jp` のステータスページ実装
Astro + Cloudflare Pages Functions + Cloudflare Worker Cron で構成
監視データの一次ソースは **updown.io**

## スクリーンショット

### ライトモード

![UNCHAINED Status Page ライトモード](./ScreenShot-Light.png)

### ダークモード

![UNCHAINED Status Page ダークモード](./ScreenShot-Dark.png)

---

## このソフトがやっていること

このプロジェクトは単なる静的ページではなく、以下をまとめて提供する小さなステータス基盤

- updown.io から監視状態を取得
- 7日分タイムライン向けにデータを正規化/補完
- Cloudflare KV にスナップショットとイベント履歴を保持
- Pages Functions で同一オリジン API を提供
- Declarative Web Push でブラウザ通知を配信（Service Worker登録なし）

要約すると

- **監視バックエンド**: updown.io
- **エッジ保存層**: Cloudflare KV (`STATUS_EVENTS`)
- **API/UI配信層**: Pages Functions + Astro
- **定期更新/通知配信層**: Worker Cron

---

## エンドユーザーに提供しているもの

- 全体ステータス要約（`Operational / Maintenance / Disruption`）
- サービスごとの状態行
  - 現在状態
  - 7日タイムライン
  - イベント詳細ポップオーバー
- 鮮度表示（`Synced` / `Delayed`）
- 通知トグルUI（`Enable Push Notifications` / `Push Notifications Enabled`）
- 状態遷移時のブラウザ通知

---

## 実行時アーキテクチャ

### 1) 取得・正規化・保存

`workers/status-events-cron.ts` が毎分（`*/1 * * * *`）実行され、次を更新

1. `status.snapshot.v1.json`
   - 元データ: updown.io `/api/checks`
   - 補完: `/metrics` と `/downtimes`
   - 出力: check一覧 + period uptime + 7日履歴
2. `events.json`
   - 元データ: updown.io `/api/checks`
   - 状態遷移（`operational/maintenance/disruption`）を生成
   - 直近イベントのみ保持
3. 新しい最新イベントがあれば Push 通知を配信

### 2) KVドキュメント

- `status.snapshot.v1.json`
  - `{ generated_at, checks[] }`
  - 画面一覧表示向け
- `events.json`
  - `{ generated_at, events[], latest{} }`
  - 遷移履歴/タイムライン向け
- `push:sub:<sha256(endpoint)>`
  - ブラウザ購読情報
- `push:last-event-id`
  - 通知重複配信防止

### 3) API提供経路

フロントは同一オリジンAPIを利用

- `GET /api/checks`
  - KVスナップショット優先
  - 取得不可時は updown.io へフォールバック
- `GET /api/events.json`
  - `ensureFreshEventsDoc` で鮮度保証
  - `checked_at` を付与して返却
- `GET /api/checks/{token}/downtimes`
- `GET /api/checks/{token}/metrics?from=...&to=...`
  - デバッグ/フォールバック用の透過API

### 4) Push購読と配信

購読API

- `GET /api/push/config`
- `POST /api/push/subscribe`
- `POST /api/push/unsubscribe`

配信処理

- `functions/_lib/web-push.ts` で VAPID JWT 生成と `aes128gcm` 暗号化
- `web_push: 8030` の Declarative payload を送信
- 期限切れ購読（`404/410`）は自動削除

---

## API一覧

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/checks` | snapshot優先のチェック一覧 |
| GET | `/api/events.json` | イベント履歴 + `checked_at` |
| GET | `/api/checks/{token}/downtimes` | check単位ダウンタイム取得 |
| GET | `/api/checks/{token}/metrics` | check単位メトリクス取得 |
| GET | `/api/push/config` | Push可否 + VAPID公開鍵 |
| POST | `/api/push/subscribe` | Push購読保存 |
| POST | `/api/push/unsubscribe` | Push購読削除 |

---

## 技術スタック

- Astro `^7.0.9`
- TypeScript `^5.9.3`
- Cloudflare Pages Functions
- Cloudflare Workers（Cron）
- Cloudflare KV（`STATUS_EVENTS`）
- updown.io API
- Node.js `>=22.12.0`

---

## 環境変数とバインディング

### 必須値

- `UPDOWN_API_KEY`（Pages + Worker）
- `PUSH_VAPID_PRIVATE_KEY`（secret）
- `PUSH_VAPID_PUBLIC_KEY`（plaintext var）
- KV binding: `STATUS_EVENTS`

### Worker設定

`wrangler.events-cron.toml` 例

```toml
name = "status-events-cron"
main = "workers/status-events-cron.ts"

[triggers]
crons = ["*/1 * * * *"]

[[kv_namespaces]]
binding = "STATUS_EVENTS"
id = "<namespace-id>"

[vars]
PUSH_VAPID_PUBLIC_KEY = "<public-vapid-key>"
```

Secret設定

```bash
npx wrangler secret put UPDOWN_API_KEY -c wrangler.events-cron.toml
npx wrangler secret put PUSH_VAPID_PRIVATE_KEY -c wrangler.events-cron.toml
```

---

## ローカル開発

インストール

```bash
npm install
```

主要コマンド

```bash
npm run dev          # Astro dev server
npm run dev:ui       # UI開発 (http://localhost:4321)
npm run dev:cf       # Functions + KV付き開発 (http://localhost:8788)
npm run dev:cf:dist  # dist配信のみで検証
npm run check        # Astro/TS check
npm run build        # check + build
npm run preview      # build結果を確認
```

推奨ワークフロー

1. `npm run dev:ui` でUI調整
2. `npm run dev:cf` で API/KV 結合挙動を確認

---

## Remote KV から local KV への同期（任意）

`dev:cf` のローカルデータを本番に近づけたい場合に使用

Remoteエクスポート

```bash
mkdir -p debug-data/kv-sync

npx wrangler kv key get events.json \
  --namespace-id 6a495433dc4b40ecac1a328329474222 \
  --remote --text > debug-data/kv-sync/events.remote.json

npx wrangler kv key get status.snapshot.v1.json \
  --namespace-id 6a495433dc4b40ecac1a328329474222 \
  --remote --text > debug-data/kv-sync/status.snapshot.v1.remote.json
```

Localへインポート

```bash
npx wrangler kv key put events.json \
  --path debug-data/kv-sync/events.remote.json \
  --namespace-id STATUS_EVENTS \
  --local --persist-to .wrangler/state

npx wrangler kv key put status.snapshot.v1.json \
  --path debug-data/kv-sync/status.snapshot.v1.remote.json \
  --namespace-id STATUS_EVENTS \
  --local --persist-to .wrangler/state
```

---

## ブラウザ確認チェック

デプロイ後やキャッシュ影響がある変更後に確認

1. ハードリロード
2. 日時表示とタイムライン表示の整合
3. ポップオーバーの開閉挙動
4. 鮮度表示（`Synced` / `Delayed`）
5. Push購読と通知配信
   - iOS/iPadOS は Home Screen 起動で確認

---

## ディレクトリ構成

```txt
src/
  pages/
    index.astro
public/
  global.css
functions/
  api/
    checks.ts
    events.json.ts
    checks/[token]/
      downtimes.ts
      metrics.ts
    push/
      config.ts
      subscribe.ts
      unsubscribe.ts
  _lib/
    updown.ts
    status-events.ts
    status-snapshot.ts
    push-subscriptions.ts
    web-push.ts
workers/
  status-events-cron.ts
wrangler.events-cron.toml
```

---

## 補足

- Pushは Declarative Web Push (`web_push: 8030`) を使用
- この実装では Service Worker の登録は不要
- 重複通知防止は `push:last-event-id` で実施
- 再送テスト時は remote KV の `push:last-event-id` を削除
