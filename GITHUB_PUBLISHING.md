# GitHub Pages 公開手順 — Authorized Public / Noindex

## 1. 公開前チェック

リポジトリのルートで以下をすべて実行し、PASSを確認してください。

```bash
python scripts/publication_audit.py
python scripts/authorized_public_audit.py
python scripts/release_readiness_audit.py
python scripts/web_smoke_test.py
node scripts/storage_roundtrip_test.js
node scripts/study_plan_test.js
node scripts/voice_assignment_test.js
node scripts/bundled_pack_runtime_test.js
node scripts/transfer_practice_test.js
node scripts/cause_diagnostics_test.js
node scripts/rediagnosis_ui_test.js
node scripts/target_strategy_test.js
node scripts/resume_checkpoint_test.js
node scripts/today_flow_test.js
node scripts/script_forward_test.js
node scripts/exam_choice_ui_test.js
node scripts/fresh_start_ui_test.js
node scripts/all_choice_surfaces_test.js
node scripts/e2e_state_guard_test.js
python scripts/browser_e2e_test.py
node --check web/config.js
node --check web/storage.js
node --check web/voice_profiles.js
node --check web/study_plan.js
node --check web/target_strategy.js
node --check web/transfer_bank.js
node --check web/app.js
```

GitHub Actionsでも同等の検証を実行してから `web/` だけをPagesへデプロイします。

## 2. GitHubへ公開

新規リポジトリの場合:

```bash
git init
git add .
git commit -m "Publish listening step trainer"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

既存リポジトリを更新する場合は、内容を確認してcommit/pushしてください。

GitHubで:

`Settings → Pages → Source → GitHub Actions`

を選択します。`main`へのpush後、`.github/workflows/pages.yml` が検証を実行し、成功した場合だけ `web/` を公開します。

## 3. 検索抑制

実ファイルの `web/index.html` には以下を含みます。

- robots: `noindex,nofollow,noarchive,nosnippet,noimageindex`
- Googlebot向けnoindex
- Bingbot向けnoindex

`web/robots.txt` はページ本体をブロックせず、現在のencoded content assetだけをクロール拒否する構成です。

重要:
- `Disallow: /` に変更しないでください。HTMLのnoindexを検索エンジンが確認できなくなる可能性があります。
- GitHub Pagesを `https://USER.github.io/REPO/` のような**プロジェクトサイト（project site）**として公開する場合、`/REPO/robots.txt` はオリジン直下の `/robots.txt` ではありません。そのため、検索抑制の主手段は各HTMLの `noindex` metaです。
- `robots.txt` と `noindex` はアクセス制御ではありません。
- Public repository自体がGitHub検索等で見つかる可能性があります。
- encoded contentはBase64であり暗号化ではありません。URLやrepositoryを知る人は復元できます。

検索で見つかりにくくしたい場合、repository名に学校名・学校略称・固有のプロジェクト名を入れず、外部サイトから積極的にリンクしない運用を推奨します。

## 4. 公開後確認

- GitHub Actionsのverify/deployが両方成功している
- 公開ページが開く
- 2019〜2026データが自動読込される
- Private Pack選択操作が不要
- ページHTMLにnoindex metaがある
- 学習ロードマップが動く
- 音声再生がSafari等の対応ブラウザで動く
- Level 1 / Level 2 / Level 3の学習フローが動く
- ONE-PASS / ミス原因診断が動く
- 進捗export/importが動く
- 再読み込み後も学習履歴が残る

## 5. 公開対象

GitHub Pagesへデプロイするのは `web/` のみです。

PDF、公式音源、スキャン、秘密鍵、`.env`、Private Pack、認証情報を追加しないでください。
