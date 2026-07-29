# UNCHAINED Status Page

`status.unchained.co.jp` 用のステータスページ
Astro で構築し、`updown.io` のチェック結果を表示します

## 概要

- サービス稼働状況の一覧表示
- 全体ステータス（Operational / Maintenance / Disruption）表示
- 7日間履歴バー表示
- 最終チェック時刻の相対表示
- 7-Day Uptime 表示

## 技術スタック

- Astro `^7.0.9`
- TypeScript `^5.9.3`
- @astrojs/check `^0.9.6`
- Node.js `>=22.12.0`

## セットアップ

```bash
npm install
```

## 開発コマンド

```bash
npm run dev      # 開発サーバ起動
npm run check    # Astro/TS チェック
npm run build    # チェック + ビルド
npm run preview  # ビルド成果物のプレビュー
```

## ビルド成果物

- 出力先: `dist/`
- サイト設定: `astro.config.mjs` (`site: https://status.unchained.co.jp`)

## ディレクトリ構成

```txt
src/
  pages/
    index.astro      # メインページ（SSR時の初期表示 + クライアント更新）
public/
  global.css         # 全体スタイル
  events.json        # 自動記録される状態遷移ログ
  favicon.svg
  favicon.png
  assets/
.github/
  workflows/
    deploy-pages.yml
    track-status-events.yml
  scripts/
    track-status-events.mjs
astro.config.mjs
package.json
```

## データ取得について

`src/pages/index.astro` で `updown.io` API を使って以下を取得します

- チェック一覧: `/api/checks`
- ダウンタイム履歴: `/api/checks/{token}/downtimes`
- メトリクス: `/api/checks/{token}/metrics`

現在は読み取り専用 API キーをページ内で参照する実装です
運用上の要件に応じて、環境変数化や中継API化を検討してください

## 自動イベント記録（メンテ/障害）

`track-status-events.yml` が5分ごとに実行され、`public/events.json` を更新します

- 記録されるイベント
  - `maintenance_started`
  - `maintenance_ended`
  - `incident_started`
  - `incident_resolved`
- 同じ状態が続く場合は追記しません
- 初回実行時はベースライン作成のみで、イベントは生成しません

### APIキーについて

GitHub Secrets に `UPDOWN_API_KEY` を設定すると、その値を優先して使用します
未設定時はスクリプト内の既定キーを使用します

## UIメモ（現行）

- 右端の「現在インジケーター」に状態別エフェクトを適用
  - 通常（緑）: 高速点滅 + 固定グロウ
  - メンテ（黄）: ゆっくりブレス（グロウなし）
  - 障害（赤）: 固定表示（グロウなし）
