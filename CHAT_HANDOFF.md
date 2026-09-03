# 次のチャットへの引き継ぎ

## このZIPの位置づけ

これはv20公開確認版です。公開先repository/commitはGitHub側の現在値を確認し、この文書の古いcommit値を正として扱わないでください。

既存の公開先を更新する場合も、新規repositoryへ公開する場合も、まず `GITHUB_PUBLISHING.md` に従って全テストを実行してください。

## 現在の主要仕様

- 2019〜2026年度の学習データを自動読込
- 初回得点を上書きしない
- 2023年度から診断を開始する学習ロードマップ
- Level 1 弱点ミニ練習
- Level 2 本番相当短会話
- Level 3 本番相当長い話
- 2〜4日後の未見定着確認
- ONE-PASS自動診断
- HEAR / VOCAB / MEANING / UPDATE / CALC / QUESTION / MEMO / CARELESS / UNKNOWN のミス原因診断
- 読み上げ速度 0.80〜1.25
- 学習履歴export/import、自動backup
- noindex設定

## 絶対に維持する保存互換性

- `web/storage.js` のPrimary / Backup / Legacy LocalStorageキーを変更しない
- データ構造変更は `schemaVersion` とmigrationで対応する
- 初回得点を上書きしない
- 問題データを進捗exportへ含めない
- 既存の未知フィールドを可能な限り保持する

## 公開上の注意

- 公開版は許諾済みの構造化学習データをencoded assetとして同梱
- encoded assetは `web/content-*.js` として1ファイルだけ存在する前提。**固定のhashファイル名を手順書へ書かない**
- Base64は暗号化ではない
- noindex/robotsは検索抑制であり認証ではない
- GitHub Pagesがproject siteの場合、project配下のrobots.txtをオリジン直下robots.txtと同等とはみなさない
- PDF、公式音源、学校ロゴ、スキャン、認証情報、Private Packを追加しない
- GitHub Pagesのdeploy対象は `web/` のみ

## 変更後に必ず実行するテスト

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

`.github/workflows/pages.yml` も同じ主要テストを実行する状態を維持してください。


## v12.2 再診断UI修正

- 再診断では、音声再生前からA〜Dの選択肢を表示する。
- 音声再生中も選択肢を表示したままにし、選択できる。
- 正解は「再回答を確定」するまで表示しない。
- 再生中は回答選択は可能だが、再回答の確定は音声終了後まで待つ。
- 音声開始前に選択肢4つ/設問がDOMに存在するかを検査し、欠落時は再描画する。
- `scripts/rediagnosis_ui_test.js` を回帰テストとして維持する。
- 採点、ONE-PASS、persistent miss、ミス原因、Level 1/2/3、年度ロードマップのロジックは変更していない。


## v13 A60/B70/C75

- 学習目標は A=60点 / B=70点 / C=75点。
- `web/target_strategy.js` が数学版と同じ `gradeInTarget` の考え方を提供。
- A60はAのみ、B70はA+B、C75はA+B+Cを必須補強に含める。
- 初回得点と全誤答履歴は目標変更で書き換えない。
- `completedRemediationQids` により、同じ音声内のAだけを処理してもB/Cを誤って完了扱いしない。
- `targetScore` はschema v5で導入され、現在のprogress schema v6でも保持。旧データはB70を既定値として自動移行。
- `scripts/target_strategy_test.js` を維持する。


## v14 Resume checkpoint

- `今日の学習を始める` は `activeSession` を最優先する。
- `activeSession` があるとき、一般的な pending / 年度補強ロジックより先に正確な途中状態を復元する。
- 再診断回答確定後は `script-ready` として保存し、同じ再診断問題へ戻さない。
- Level 1回答確定後は `drill-submitted` として保存し、再開時に `advanceDrill()` へ進む。
- Level 2/3回答確定後は `transfer-submitted` として保存し、再開時に `advanceTransfer()` へ進む。
- 定着確認失敗後は `retention-failed` として保存し、再開時に3問類題へ進む。
- 過去問本番は回答・現在Number・再生済み状態を保存する。
- `activeSession` はprogress schema v6で保存・mergeする。
- `scripts/resume_checkpoint_test.js` を維持する。


## v15 Today flow

- `今日の学習を始める` はdata-taskを信用せず、クリック時に必ず `computeNextTask()` を再実行する。
- submitted checkpointを消化してdashboardへ戻っただけの場合、その1クリック内で次taskを再計算して実際の次画面まで進む。
- 無効なactiveSessionを復元できなかった場合も、同じクリック内で次の有効taskへ進む。
- 無限遷移防止のため最大12回のbounded loop。
- 途中保存があるときボタン文言は `続きから次へ進む`。
- `判定へ` は廃止し、`結果を確認して次へ` に統一。
- `scripts/today_flow_test.js` を維持する。


## v16 Script-forward

- `activeSession.type === "script"` を無条件に同じscript画面へ戻さない。
- submitted rediagnosisの `script-ready` からはscriptを1回表示する。
- script画面を一度開いた後のTodayは、必須cause未入力がなければ `startDrillsFromScript()` へ直接進む。
- persistent missでcause未入力の場合だけscript/cause画面を再表示する。
- dashboard task inspectionは副作用なし。pending hydrateは実際に進む時だけ行う。
- `scripts/script_forward_test.js` を維持する。


## v17 Exam-choice UI

- 本番問題は回答選択肢を最優先で描画する。
- `examTitle` / progress / section label等の装飾DOMが欠けても選択肢描画を停止しない。
- `playExam()` は `ensureExamAnswerUi()` 成功後だけ音声を開始する。
- index.htmlのローカルCSS/JSは `?v=17` でcache bustする。
- `scripts/exam_choice_ui_test.js` を維持する。


## v18 Fresh-start

- 学習履歴0件の初回 `今日の学習を始める` は2023年度へ。
- `startExam()` は描画直後に `ensureExamAnswerUi()` を必ず実行。
- 初回選択肢がなければ音声とNextを無効化。
- `Build v18` を常時表示し、古い公開版/キャッシュとの取り違えを検出可能。
- 公開アセットは `?v=18`。
- `scripts/fresh_start_ui_test.js` を維持する。


## v19 All-choice surfaces

- 選択肢を使う全5画面を同一方針で防御する。
- exam / rediagnosis / drill / transfer / retention。
- choices-first rendering。
- audio開始前に各 `ensure*AnswerUi()` を必須化。
- choices描画失敗時はplay/submit(next)を無効化し、専用error surfaceを表示。
- `renderChoiceGroup()` は不正container/question/choicesでthrowせずfalseを返す。
- Build v19 / `?v=19`。
- `scripts/all_choice_surfaces_test.js` を維持する。


## v20 Real-browser E2E

- `transferView` を `cacheEls()` view registryへ必ず含める。
- `showView()` の全viewはHTML・cacheEls・showViewの3者一致を `e2e_state_guard_test.js` で検証。
- exam / rediagnosis / drill / transfer / retention は音声未再生で進行・採点不可。
- 必要回答が揃う前もNext/Submitはdisabled。
- `browser_e2e_test.py` がChromiumで空データから実際に問題を解く。
- PASS-A / PASS-Bの2回とも、2023全10問・再診断・script・Level1・Level2・retentionまで実行する。
- GitHub ActionsでもPlaywright Chromiumをインストールしてbrowser E2Eを通してからdeploy。
