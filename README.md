# Listening Practice Lab + TTS Generator

英語入試のリスニング練習用に、次の2つをまとめた非公式プロジェクトです。

1. **受験生向けWebアプリ** — URLを開いて「聞く → 答える → 採点 → 復習」
2. **教材作成者向けTTS生成ツール** — ローカルJSONから男女別の合成音声MP3を生成

> [!IMPORTANT]
> 本プロジェクトは**非公式**です。使用する音声は**合成音声**であり、学校の公式ツール・公式音源ではありません。実際の入試の声質・速度・イントネーション・間を完全再現するものではありません。公開リポジトリには公式過去問本文、公式リスニングスクリプト全文、公式音源、ロゴ、問題冊子PDF、スキャン画像を含めないでください。

## Webアプリ

`web/` がGitHub Pagesでそのまま動く静的Webアプリです。

公開ページ：<https://fyam8.github.io/exam-listening-tts-generator/>

### できること

- 本番モード：各問題の音声は原則1回、途中で正解を表示しない
- 復習モード：再生し直し、正解・根拠・ひっかけ・重要表現を確認
- ア・イ・ウ・エ形式の選択回答
- 全問終了後にまとめて採点
- A/B/C別の正答状況
- 最終決定・情報変更・時刻・金額などのタグ別分析
- LocalStorageへの学習履歴保存
- スマホ / iPad / PC対応
- APIキー不要
- ローカルJSON読込
- ブラウザのWeb Speech APIによる男声・女声・ナレーターの使い分け

内蔵問題はすべて**【オリジナル類題】**です。

### ローカルで確認

```bash
python -m http.server 8000 -d web
```

ブラウザで `http://localhost:8000` を開きます。

`file://` で `web/index.html` を直接開いても、内蔵デモはフォールバックデータで動作します。

### 自分の問題をローカルで使う

`web/examples/local-set-template.json` を参考にJSONを作り、Web画面の「ローカルJSONを読み込む」から選択します。

```json
{
  "id": "my-set",
  "title": "My Local Set",
  "questions": [
    {
      "number": 1,
      "dialogue": [
        {"role": "male", "text": "Example."},
        {"role": "female", "text": "Example response."}
      ],
      "question": "What happened?",
      "choices": ["A", "B", "C", "D"],
      "correct": 0,
      "points": 2,
      "difficulty": "A",
      "tags": ["detail"],
      "review": {
        "reason": "根拠",
        "trap": "ひっかけ",
        "expressions": ["important phrase"]
      }
    }
  ]
}
```

`correct` は **0始まり**です。0=ア、1=イ、2=ウ、3=エ。

ローカルJSONはアプリのJavaScriptが端末上で読み込みます。このサイト自身がファイルをサーバーへアップロードする処理はありません。ただしWeb Speech APIの音声合成は、ブラウザやOSによってオンライン処理される場合があります。

## GitHub Pages公開

1. このリポジトリをGitHubへpush
2. Repository **Settings → Pages**
3. Sourceを **GitHub Actions** に設定
4. `main` にpushすると `.github/workflows/pages.yml` が `web/` を公開

公開前に必ず：

```bash
python scripts/publication_audit.py .
python scripts/validate_web_data.py
```

## TTS生成ツール

既存の `generate.py` もそのまま残しています。高品質な事前生成MP3が必要な場合はこちらを使います。

### 必要環境

- Python 3.10+
- インターネット接続（TTS生成時）

```bash
python -m venv .venv
source .venv/bin/activate   # Windowsは .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 基本

```bash
python generate.py validate --input scripts/private/my.private.json

python generate.py generate \
  --input scripts/private/my.private.json \
  --output output/practice.mp3
```

利用可能音声：

```bash
python generate.py voices --locale en-US
python generate.py voices --locale en-GB
```

詳細設定は `config.example.json`、入力例は `examples/sample_script.json` を参照してください。

## 早稲渋対策としての設計

Webのオリジナル問題は、全文を完全に聞き取るよりも「正解に必要な情報を1回で拾う」ことを意識しています。

重点タグ：

- 次に来る自然な発言
- 最終決定
- 情報変更 / 予定変更
- したこと / しなかったこと
- 場所
- 時刻 / 所要時間
- 金額 / 数量
- 理由 / 目的
- 内容一致 / 要点

A問題の取りこぼしは、結果画面で優先的に警告します。

## 公開時の著作権・安全方針

公開してよいもの：

- コード
- 完全オリジナルのサンプル問題
- オリジナル問題の解説
- 一般的な設定例

公開しないもの：

- 公式過去問本文
- 公式リスニングスクリプト全文
- 公式音源
- 学校ロゴ
- 問題冊子PDF / スキャン
- 個人用の私的教材JSON
- APIキーや認証情報

正規に入手した教材であっても、公開・再配布できるとは限りません。

## テスト

```bash
python -m pip install -r requirements-dev.txt
python -m pytest
python scripts/publication_audit.py .
python scripts/validate_web_data.py
node --check web/app.js
```

## License

コードはMIT Licenseです。利用者が入力する教材や生成物にMIT Licenseが自動適用されるわけではありません。
