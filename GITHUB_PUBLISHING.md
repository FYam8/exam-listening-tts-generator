# GitHub / GitHub Pages 公開手順

## 1. 公開前チェック

```bash
python scripts/publication_audit.py .
python scripts/validate_web_data.py
python -m pytest
node --check web/app.js
```

さらに必ず目視で確認してください。

公開リポジトリに含めないもの：

- 公式過去問本文
- 公式リスニングスクリプト全文
- 公式音源
- 学校ロゴ
- PDF / スキャン
- `scripts/private/` の私用教材
- APIキーや認証情報

## 2. GitHubへpush

```bash
git init
git add .
git commit -m "Add listening practice web app"
git branch -M main
git remote add origin https://github.com/FYam8/exam-listening-tts-generator.git
git push -u origin main
```

## 3. GitHub Pagesを有効化

Repository:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

`main` へのpushで `.github/workflows/pages.yml` が `web/` を公開します。

## 4. 公開後の確認

スマホ・PCの両方で以下を確認してください。

- ホーム画面が表示される
- 音声テストが鳴る
- 本番モードで同じ問題を再再生できない
- 4択を選択できる
- 最後に採点される
- A/B/Cと技能タグが表示される
- 復習詳細が開く
- 学習履歴が保存される
- ローカルJSONを読み込める

## 注意

Web版の既定音声はブラウザのWeb Speech APIです。端末により声質・音声数が異なります。
より統一された声質が必要な場合は、既存の `generate.py` でオリジナル教材のMP3を生成し、権利上公開可能な音声だけを別途Webへ組み込んでください。
