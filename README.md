# les-playground

A browser playground for [unak/les](https://github.com/unak/les), the Les language.
GitHub Actions builds unak/les and publishes the playground to GitHub Pages.

The UI is available in English and Japanese. It follows the browser's language, and the globe menu
in the header switches it; the choice is remembered in the browser.

## How it works

- `cmd/les` from unak/les is built unmodified with `GOOS=js GOARCH=wasm`.
- Go's js/wasm port does file I/O through `globalThis.fs`, a callback API shaped like Node's `fs`.
  `web/worker.js` implements it as a read-only in-memory filesystem: the editor contents become
  `/main.les`, and unak/les's `examples/*.les` sit next to it, so `import` works.
- Standard input works by holding the callback of a `read` on fd 0 until the page sends input.
  The worker's event loop keeps running while the Go goroutine waits, so no `SharedArrayBuffer` is needed.
- Every run gets a fresh Web Worker. Stop (Ctrl+C) simply terminates it.
- The terminal is [xterm.js](https://xtermjs.org/). Line editing (echo, Backspace, Ctrl+U, Ctrl+D) is done by the page.

## Key input mode

Les has no way to switch the terminal out of line mode, so a full-screen program such as
`2048.les` is normally run behind a shell front end that does `stty -icanon -echo` and turns the
arrow keys into letters. The "Key input" switch in the toolbar does the same in the page:

- every key press is sent at once as a line of its own, without Enter and without echo;
- the arrow keys become `w` / `a` / `s` / `d` (also with modifiers, and in application cursor mode);
- only letters and digits are passed on; Ctrl+D closes standard input and Ctrl+C stops the program;
- the cursor is hidden while the program runs;
- the text field below the terminal turns into ← ↑ ↓ → buttons, for phones;
- the terminal font shrinks, if needed, so that about 58 columns by 23 rows fit.

Examples kept in this repository can ask for it: `OWN` in `scripts/examples.mjs` lists them with
extra arguments (`{seed}` becomes a fresh number on every run) and whether to start in key input
mode. `web/examples/2048.les` runs as `les main.les {seed} --raw` in key input mode.

## Deployment

`.github/workflows/pages.yml` runs on:

| Trigger | What it does |
| --- | --- |
| Push to `main` | Builds unak/les master and publishes it |
| Hourly (at :23) | Compares with the published `version.json`; builds and publishes only if unak/les master or this repository has moved |
| Manual (workflow_dispatch) | Builds the branch, tag or commit given as `les_ref` and publishes it |

After the build, `scripts/smoke.mjs` runs the real `worker.js` and `les.wasm` under Node.
If the playground's own checks fail (stdin, EOF, import, exit codes, the starter samples, 2048.les), nothing is published.
If one of unak/les's examples fails, the run only reports a warning and still publishes.

One-time setup: set Settings → Pages → Build and deployment → Source to **GitHub Actions**.
Note that GitHub disables scheduled workflows in public repositories after 60 days without commits.

## Building locally

You need Go (the version unak/les's go.mod asks for, or newer) and Node.js.

```sh
npm ci
git clone https://github.com/unak/les.git les
scripts/build.sh les dist
node --liftoff-only scripts/smoke.mjs --site dist --les les
python3 -m http.server -d dist 8000   # http://localhost:8000/
```

## Layout

- `web/index.html` — the page (UI strings for both languages live here)
- `web/worker.js` — runs one les program per Web Worker; in-memory fs and stdin
- `web/hello.en.les`, `web/hello.ja.les` — the starter sample in each UI language
- `web/examples/` — examples kept in this repository (2048.les), registered in `scripts/examples.mjs`
- `scripts/build.sh`, `scripts/build.mjs` — build les.wasm and assemble the site in `dist/`
- `scripts/smoke.mjs` — smoke test run in CI before deploying

## Licenses

The published site ships the license texts of les (2-Clause BSD, taken from unak/les's README),
Go (`wasm_exec.js` and the runtime) and xterm.js (MIT), linked from the page footer.
