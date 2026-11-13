# les-playground

[unak/les](https://github.com/unak/les)（Les 言語）をブラウザで実行するプレイグラウンドです。
GitHub Actions で unak/les をビルドして、GitHub Pages に公開しています。

## しくみ

- les 本体（`cmd/les`）は無改造のまま、`GOOS=js GOARCH=wasm` でビルドしています。
- Go の js/wasm は、ファイル I/O を `globalThis.fs`（Node の fs と同じ形のコールバック API）経由で行います。
  `web/worker.js` がこれをメモリ上の読み取り専用ファイルシステムとして実装しており、
  エディタの内容が `/main.les`、unak/les の `examples/*.les` が `/` 直下に置かれます。
- 標準入力は、fd 0 の `read` のコールバックを入力が届くまで保留する方式です。
  Go 側のゴルーチンが待っている間も Worker のイベントループは動くので、`SharedArrayBuffer` は不要です。
- 1 回の実行ごとに新しい Web Worker を作ります。停止（Ctrl+C）は Worker を終了させるだけです。
- 端末は [xterm.js](https://xtermjs.org/) です。行編集（エコー、Backspace、Ctrl+U、Ctrl+D）はページ側で行っています。

## デプロイ

`.github/workflows/pages.yml` が次のタイミングで動きます。

| きっかけ | 動作 |
| --- | --- |
| `main` への push | unak/les の master をビルドして公開 |
| 毎時（23 分） | 公開中の `version.json` と比べて、unak/les の master かこのリポジトリが進んでいればビルドして公開 |
| 手動（workflow_dispatch） | `les_ref` に指定したブランチ・タグ・コミットをビルドして公開 |

ビルドの後、`scripts/smoke.mjs` が Node 上で実際の `worker.js` と `les.wasm` を動かして確認します。
プレイグラウンド自体の確認（stdin、EOF、import、終了コードなど）が失敗すると公開しません。
unak/les の examples が失敗した場合は警告だけ出して公開します。

初回だけ、リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** にしておく必要があります。
なお、public リポジトリで 60 日間コミットがないと、GitHub が定期実行を自動で止めます。

## 手元でビルドする

Go（unak/les の go.mod が要求する版以上）と Node.js が必要です。

```sh
npm ci
git clone https://github.com/unak/les.git les
scripts/build.sh les dist
node --liftoff-only scripts/smoke.mjs --site dist --les les
python3 -m http.server -d dist 8000   # http://localhost:8000/
```

## ライセンス

公開サイトには、les（2 条項 BSD、unak/les の README より）、Go（`wasm_exec.js` とランタイム）、
xterm.js（MIT）のライセンス文を同梱し、ページ下部からリンクしています。
