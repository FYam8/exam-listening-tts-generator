# Listening Step Trainer — Authorized Public / Noindex Build

2019〜2026年度のリスニング学習データを、利用者がファイル選択しなくても自動読み込みするWebアプリです。

## 検索抑制

この公開版では以下を実施しています。

- HTMLに `noindex,nofollow,noarchive,nosnippet,noimageindex`
- Googlebot / Bingbot向けnoindex
- `robots.txt` ではページ本体をクロール可能にしてnoindexを読ませ、埋め込み学習データのJSファイルのみクロール拒否
- 公式データを平文JSONとして置かず、Base64化した埋め込みデータとして配信
- sitemapを作成しない
- 公開ソースのタイトル・README・変数名には学校固有名を入れない

`noindex` は検索エンジンへの指示であり、アクセス制御ではありません。公開URLを知っている人は閲覧できます。

## 学習データ

ページを開くと2019〜2026年度のデータを自動読み込みします。通常、利用者がデータファイルを選択する必要はありません。

学習は2023年度から始めます。最近の傾向に近い問題で弱点を診断し、2019〜2022年度で補強したうえで、2024年度を中間確認、2025・2026年度を仕上げの模試に使う設計です。

## 読み上げ音声

- Man欄には端末内の男性候補、Woman欄には女性候補だけを表示
- Narratorは別に選択可能
- 音声名から性別を判定できない端末では、その旨を画面に表示
- 音声の種類・品質はブラウザとOSにより異なる

## 学習履歴

通常のバージョンアップでは同じLocalStorageキーを継続利用し、データ構造変更は `schemaVersion` で移行します。

- 旧版保存データの自動移行
- 自動バックアップ
- Primary破損時の復旧
- 進捗エクスポート / インポート
- 初回得点を上書きしない安全統合

## GitHub Pages

公開前:

```bash
python scripts/publication_audit.py
python scripts/authorized_public_audit.py
python scripts/web_smoke_test.py
node scripts/storage_roundtrip_test.js
node scripts/voice_assignment_test.js
node scripts/bundled_pack_runtime_test.js
node --check web/voice_profiles.js
node --check web/storage.js
node --check web/app.js
```

GitHub Pagesは `web/` のみを公開します。

検索で見つかりにくくしたい場合は、GitHubリポジトリ名にも学校名・学校略称・固有のプロジェクト名を入れず、外部サイトからリンクしないことを推奨します。
