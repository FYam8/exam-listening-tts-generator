# TTS方式の比較（2026年8月確認）

料金・無料枠・利用条件は変更されます。採用前に必ずリンク先の最新情報を確認してください。

| 方式 | 利用条件・APIキー | 費用・無料枠 | 自然さ | GitHub公開・保守性 | 本ツールでの判断 |
| --- | --- | --- | --- | --- | --- |
| [edge-tts](https://github.com/rany2/edge-tts) | ライブラリはLGPL-3.0、キー不要。Microsoft Edgeのオンライン音声を使う第三者製で、入力はサービスへ送信される。Microsoft側の利用条件も確認が必要 | 現状はアカウント・課金登録不要 | 英米を含むニューラル音声を選択可能 | 導入は最も簡単。ただし公式APIのSLAはなく、仕様変更で停止し得る | **既定**。個人の学習用と簡単な導入を優先 |
| [Azure AI Speech](https://azure.microsoft.com/pricing/details/cognitive-services/speech-services/) | Microsoftアカウント、Speechリソース、キーまたは対応認証が必要 | Neural TTSのFree (F0) は月50万文字と案内。超過後や地域の条件は申込時に確認 | 高品質。公式SSML等の制御が豊富 | 公式SDK・仕様・課金管理があり長期運用向き。秘密情報をGitHubへ直書きしない | 安定運用が必要な将来のprovider候補 |
| [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech/pricing) | Google Cloudプロジェクト、認証、請求先設定が必要 | Standardは月400万文字、WaveNetは月100万文字まで無料との案内。新しい音声種別は別料金の場合がある | Neural2、Chirp等を提供 | 公式APIで保守性は高いが、クラウド設定と認証管理が必要 | 代替候補 |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | キー不要。現行エンジンはGPL-3.0。音声モデルごとのライセンス確認が必要 | ローカル実行で従量料金なし | 音声モデルにより差が大きい | 初回モデル取得後はオフライン。Windows/macOS/Linux間の導入差とモデル配布条件の管理が必要 | プライバシー優先時の候補。既定にはしない |
| [ElevenLabs](https://elevenlabs.io/pricing) | アカウントとAPIキーが必要。生成物の利用権はプラン条件を確認 | Freeは月10,000 creditsと案内。有料プランあり | 非常に自然な選択肢が多い | APIキーと利用量の管理が必要。無料枠は長い練習音声では不足し得る | 音質を最優先する任意候補 |

## edge-ttsを既定にした理由

`edge-tts` 7.2系はPythonから音声一覧を取得でき、音声名、rate、volume、pitchを指定してMP3を生成できます。APIキーなしでWindows / macOS / Linuxから同じコードを使えるため、`clone → pip install → JSON指定 → MP3` という目標に最も合います。

一方、Microsoftの有償Azure Speech APIとは別の経路です。利用可否や互換性の恒久保証がないため、本ツールは再試行、明確なエラー、音声一覧確認、設定ファイルによる音声差し替えを備えます。学校公式音源の再現をうたわず、合成練習音声として使用してください。

## MP3結合方式

MP3断片のバイト列を単純連結すると、途中のID3ヘッダー、エンコーダ遅延、形式差により再生互換性や間が不安定になります。本ツールでは各断片を一度デコードし、無音をPCM段階で加え、同一サンプルレート・チャンネル数へ揃えてから、完成MP3を1回だけ書き出します。
