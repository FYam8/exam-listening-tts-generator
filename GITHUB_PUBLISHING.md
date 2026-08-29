# GitHub公開手順

公開用ZIPには `private-content/` を含めていません。

1. GitHubで空のリポジトリを作成
2. 公開用ZIPの中身をpush
3. Settings → Pages → Source → GitHub Actions
4. `main`へpushすると `web/` のみが公開される

```bash
python scripts/publication_audit.py
python scripts/web_smoke_test.py
node scripts/storage_roundtrip_test.js
node --check web/storage.js
node --check web/app.js

git init
git add .
git commit -m "Initial listening step trainer"
git branch -M main
git remote add origin https://github.com/FYam8/exam-listening-tts-generator.git
git push -u origin main
```

GitHub Pages上ではPrivate Packは配信されません。利用者本人がブラウザの「Private Packを読み込む」からローカルファイルを選択します。

## 絶対に公開しない

- `private-content/`
- `*.private.json`
- 公式問題冊子PDF
- 公式解答PDF
- 公式リスニングスクリプトPDF
- 公式音源
- 学校ロゴやスキャン

公開版の類題はすべてオリジナルです。


## 学習履歴とアップデート

GitHub Pages上の学習履歴は、バージョン番号を含まない固定LocalStorageキー
`waseshibu-listening-progress`
に保存します。

`main`へ新しいWebアプリをデプロイしても、同じoriginである限り学習履歴は自動継続します。
今後のバージョンでもこのキーを変更しないでください。データ構造変更は `schemaVersion` と migration で処理します。

旧キー `waseshibu-step-progress-v1` は自動移行対象です。
