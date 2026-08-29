# GitHub公開手順

## 1. ローカル最終確認

リポジトリ直下で実行します。

```bash
python -m pytest
python scripts/publication_audit.py .
python generate.py validate --input examples/sample_script.json
git status --short
```

`publication_audit.py` が成功しても、著作権判断を完全に自動化できるわけではありません。`git diff --cached` を人の目でも確認します。

## 2. コミット対象を限定

```bash
git init
git add .gitignore README.md LICENSE CONTRIBUTING.md GITHUB_PUBLISHING.md SECURITY.md \
  generate.py requirements.txt requirements-dev.txt config.example.json \
  examples tests scripts docs .github
git diff --cached --name-only
git diff --cached
```

次が含まれていたら公開を中止して、ステージから外してください。

- 公式過去問本文・公式スクリプト・公式音源
- ロゴ、PDF、スキャン画像
- `scripts/private/`、`*.private.json`、生成MP3
- APIキー、トークン、メールアドレス等

## 3. GitHubで空のリポジトリを作成

GitHubの **New repository** から作成します。公開範囲（Public / Private）は所有者が最終決定してください。GitHub側でREADMEやLICENSEを追加せず、空の状態にすると競合を避けられます。

## 4. push

```bash
git branch -M main
git remote add origin https://github.com/<OWNER>/<REPOSITORY>.git
git commit -m "Initial public release"
git push -u origin main
```

認証画面や二要素認証は、GitHubの案内に従って所有者が操作してください。パスワードやトークンをコード、設定ファイル、チャットへ貼り付けないでください。

## 5. 公開後

- GitHub Actionsが成功しているか確認
- README冒頭の非公式・合成音声明記を確認
- リポジトリ内検索で学校公式資料がないことを再確認
- 必要に応じてRepository settingsでIssues、Dependabot、Private vulnerability reportingを設定

