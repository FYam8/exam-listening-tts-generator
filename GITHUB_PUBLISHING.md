# GitHub Pages 公開手順 — Authorized Public / Noindex

## 公開前

```bash
python scripts/publication_audit.py
python scripts/authorized_public_audit.py
python scripts/web_smoke_test.py
node scripts/storage_roundtrip_test.js
node --check web/storage.js
node --check web/app.js
```

すべてPASSしてから公開してください。

## 公開

```bash
git init
git add .
git commit -m "Publish listening step trainer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

GitHub:

Settings → Pages → Source → GitHub Actions

`main`へのpushで `web/` のみがPagesへデプロイされます。

## 検索抑制

このビルドは次を含みます。

- index.html の robots noindex / nofollow / noarchive / nosnippet / noimageindex
- Googlebot / Bingbot noindex
- robots.txt `Disallow: /`
- 平文の公式過去問JSONを公開しない
- 過去問データをBase64化してWeb側でデコード

ただし、これらは検索抑制であり認証ではありません。公開URLを知っている人はアクセスできます。

GitHub repository をPublicにする場合、リポジトリ自体がGitHub検索等で見つかる可能性があります。公式過去問本文そのものは平文コードとして保存しない構成です。

## 公開後確認

- ページを開くだけで2019〜2026データが自動読込される
- Private Pack選択ボタンが表示されない
- `robots.txt` がアクセスできる
- ページHTMLに `noindex` がある
- 2019〜2026のロードマップが動く
- 進捗エクスポート / インポートが動く
- 再読み込み後も学習履歴が残る
