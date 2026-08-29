# Contributing

Issue・Pull Requestを歓迎します。変更は小さく保ち、目的と検証方法を説明してください。

## 開発手順

```bash
python -m venv .venv
python -m pip install -r requirements-dev.txt
python -m pytest
python scripts/publication_audit.py .
```

## 絶対にコミットしないもの

- 学校の公式過去問本文、公式リスニングスクリプト、公式音源
- 学校ロゴ、問題冊子PDF、スキャン画像
- 利用者が私的利用のために作成した台本や生成音声
- APIキー、認証情報、個人情報

テスト用英文は、短い自作例にしてください。既存教材の文章を少しだけ言い換えたものも避けてください。

## コード方針

- Python 3.10以上で動くこと
- Windows / macOS / Linux固有のパスを埋め込まないこと
- エラーは利用者が修正できる具体的な文にすること
- ネットワークを使わない単体テストを維持すること
- 出力ファイルを既定で上書きしないこと

