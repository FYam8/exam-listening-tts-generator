# Listening Practice TTS Generator

早稲田渋谷シンガポール校を含む英語入試のリスニング練習用に、ローカルのJSON台本から自然な男女別音声を生成し、間（ポーズ）を含む**1本のMP3**にまとめるPythonツールです。公開コードは特定年度・特定校の本文に依存しない一般的な設計です。

> [!IMPORTANT]
> このツールは**非公式**です。生成物は**合成音声**であり、学校の公式ツール・公式音源ではありません。実際の入試の声質・速度・イントネーション・間を完全再現するものではありません。

公開リポジトリには、学校の公式過去問本文、公式リスニングスクリプト、公式音源、ロゴ、問題冊子PDF、スキャン画像を含めません。利用者が正規に入手し、利用権限を持つ教材だけをローカルJSONとして入力してください。

## 特長

- `edge-tts` のニューラル音声を利用（APIキー不要・インターネット接続必須）
- Man / Woman / Narrator に別々の声を指定
- 米国英語・英国英語・混在プリセット
- `Number → 会話 → Question → 解答用無音` をJSONから自動構成
- 発話間・問題番号後・Question後の間を個別設定
- 会話とQuestionの話速を別々に設定
- 音量差を穏やかに補正し、全断片を正規の単一MP3へ再エンコード
- 入力検証、上書き防止、再試行、ローカルキャッシュ
- Windows / macOS / Linux対応

## 必要環境

- Python 3.10以上
- インターネット接続（音声生成時）

MP3処理用のffmpeg実行ファイルは `imageio-ffmpeg` が対応環境向けに用意するため、通常は別途インストール不要です。

## インストール

```bash
git clone <YOUR-REPOSITORY-URL>
cd waseshibu-listening-tts
python -m venv .venv
```

Windows（PowerShell）:

```powershell
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

macOS / Linux:

```bash
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 最短の使い方

1. `examples/sample_script.json` を参考に、公開しない台本を `scripts/private/my.private.json` に保存します。
2. ネット接続なしで入力を検証します。
3. 問題がなければMP3を生成します。

```bash
python generate.py validate --input scripts/private/my.private.json
python generate.py generate \
  --input scripts/private/my.private.json \
  --output output/practice.mp3
```

Windowsでは1行で実行できます。

```powershell
python generate.py generate --input scripts/private/my.private.json --output output/practice.mp3
```

既存MP3を置き換える場合だけ `--force` を追加してください。

## JSON仕様

### 推奨：問題単位の形式

```json
{
  "title": "Listening practice set 1",
  "questions": [
    {
      "number": 1,
      "dialogue": [
        {"role": "male", "text": "I was going to meet Emma at three, but her train is delayed."},
        {"role": "female", "text": "So will you meet her at four instead?"},
        {"role": "male", "text": "Actually, she asked me to meet her at the library at half past four."}
      ],
      "question": "Where will the man meet Emma?",
      "answer_pause": 7
    }
  ]
}
```

この形式では `Number 1.`、会話、`Question.`、7秒の解答用無音が自動で並びます。

### 発話を直接並べる形式

```json
{
  "title": "Custom practice",
  "items": [
    {"role": "narrator", "kind": "number", "text": "Number 1."},
    {"role": "male", "text": "Example sentence."},
    {"role": "female", "text": "Example response."},
    {
      "role": "narrator",
      "kind": "question",
      "text": "Question. What happened?",
      "pause_after": 7
    }
  ]
}
```

トップレベルを配列にした形式と、1行1オブジェクトの `.jsonl` にも対応します。

### 項目一覧

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `role` | 必須 | `male` / `female` / `narrator`。`man` / `woman` も可 |
| `text` | 発話時 | 読み上げる英文 |
| `kind` | 任意 | `speech` / `number` / `question` / `pause` |
| `pause_after` | 任意 | 発話後の無音（秒、0〜120） |
| `pause_after_ms` | 任意 | 発話後の無音（ミリ秒） |
| `rate` | 任意 | その発話だけの話速（例 `-3`、`+5%`） |
| `voice` | 任意 | その発話だけの edge-tts `ShortName` |
| `volume` / `pitch` | 任意 | edge-tts形式の個別調整 |

`pause_after` がないQuestionには、既定で7秒の無音が入ります。平坦な強調を避けるため、答えに関わる数字や否定語を大文字・記号で人工的に強調せず、通常の英文として記述してください。自動的な数字の書き換えは、意味を変える危険があるため行いません。

## 音声・速度・間の設定

設定の全項目は [config.example.json](config.example.json) にあります。

```bash
python generate.py generate \
  --config config.example.json \
  --input scripts/private/my.private.json \
  --output output/practice.mp3
```

よく使うCLI指定：

```bash
# 英国英語の3音声
python generate.py generate --preset uk --input scripts/private/my.private.json --output output/uk.mp3

# 会話を標準より3%速く、Question後を10秒にする
python generate.py generate --rate=+3 --answer-pause 10 --input scripts/private/my.private.json --output output/fast.mp3

# 実際には生成せず、役割・話速・間だけ確認
python generate.py generate --dry-run --input scripts/private/my.private.json --output output/check.mp3
```

既定値は会話 `-2%`、Question `-7%`、会話間320msです。Questionだけ少し落ち着かせ、会話は「簡単に聞こえすぎない」速度にしています。学習者や年度傾向に合わせて、まず `-5%〜+5%` の範囲で調整するのがおすすめです。

## 利用可能な音声を調べる

```bash
python generate.py voices --locale en-US
python generate.py voices --locale en-GB --gender Female
```

既定プリセット：

| preset | Male | Woman | Narrator |
| --- | --- | --- | --- |
| `us` | `en-US-GuyNeural` | `en-US-JennyNeural` | `en-US-AriaNeural` |
| `uk` | `en-GB-RyanNeural` | `en-GB-SoniaNeural` | `en-GB-LibbyNeural` |
| `mixed` | `en-US-GuyNeural` | `en-GB-SoniaNeural` | `en-US-AriaNeural` |

サービス側で音声名が変更された場合は `voices` コマンドで現行名を確認し、設定ファイルまたはCLIで差し替えてください。

## 入試リスニング練習での使い方

このツールは全文の完全な書き取りよりも、正解に必要な情報を1回で拾う訓練を想定しています。台本を自作する場合は、最終決定、予定変更、実施／未実施、場所、時刻、所要時間、金額、数量、理由、目的、次の自然な発言を問うと効果的です。

`but`、`however`、`actually`、`instead`、`at first`、`finally`、`not`、`only`、`before`、`after` などの情報更新語は、過剰に強調せず文脈の中へ自然に置いてください。

## TTS方式の選定

2026年8月時点の比較は [docs/tts-comparison.md](docs/tts-comparison.md) にまとめています。既定は、APIキー不要・導入が簡単・男女と英米の音声を選べる `edge-tts` です。ただしMicrosoft Edgeのオンライン読み上げ機能を利用する第三者製ライブラリであり、公式の安定性保証やSLAはありません。長期運用や業務用途では、公式APIである Azure AI Speech / Google Cloud Text-to-Speech 等も検討してください。

## プライバシーとキャッシュ

- 読み上げテキストはオンラインTTSへ送信されます。機密情報を入力しないでください。
- 生成断片は既定で `.cache/tts/` に保存され、Gitの対象外です。
- キャッシュを使わない場合は `--no-cache` を指定します。
- `scripts/private/`、`*.private.json`、`output/`、音声ファイルは `.gitignore` で除外しています。

コミット前には必ず次を実行してください。

```bash
python scripts/publication_audit.py .
git status --short
git diff --cached --name-only
```

## 著作権上の注意

- 正規に入手した教材でも、公開・再配布できるとは限りません。
- 学校の公式過去問本文・公式スクリプト全文・公式音源・ロゴ・問題冊子PDF・スキャン画像をこのリポジトリへ追加しないでください。
- 合成音声を作成・利用・配布できるかは、入力教材の権利、TTSサービスの規約、利用地域の法令を利用者自身で確認してください。
- `examples/sample_script.json` は本リポジトリ用に作成した架空例で、公式問題の転載ではありません。

## 免責事項

本ソフトウェアは教育目的の補助ツールとして無保証で提供されます。特定校による承認・提携・監修を受けたものではなく、入試結果を保証しません。音声サービスの仕様変更、停止、発音差、料金・利用条件の変更について、作者および貢献者は責任を負いません。

## 開発・テスト

```bash
python -m pip install -r requirements-dev.txt
python -m pytest
python scripts/publication_audit.py .
```

GitHub Actionsでも構文、テスト、公開対象監査、サンプル入力のdry-runを確認します。

## ライセンス

コードは [MIT License](LICENSE) です。利用者が入力する教材や生成音声に、MIT Licenseが自動的に適用されるわけではありません。
