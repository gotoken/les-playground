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
- After load, the footer shows a "stack score": the largest `n` for which a small recursive script (`f(n) = 1 + f(n - 1)`) runs
  without overflowing the browser's stack, measured in throwaway workers (doubling, then bisecting to about 10%). les evaluates on
  the browser's own stack and the amount differs a lot between browsers, so the score is for comparing browsers and devices; it is
  not a recursion limit for other programs. The `?` button next to it shows the script.
- Links: `#ex=<name>` (e.g. `#ex=lcs-dp`) opens the page with that example selected and runs it. `#z=<data>` carries a whole
  script (raw DEFLATE, base64url; `#u=<data>` is the same uncompressed, used when that is shorter or the browser cannot
  compress), with `ex=<name>&` in front when the script needs that example's run settings (arguments, key input). The script is
  in the URL fragment, so it is not sent to a server. Once loaded, the fragment is removed from the address bar.
- The share button in the editor's title bar makes such a link. It works once a run of the current text has ended (exit, crash
  or Stop) and until the text is edited. Its dialog has a description field (default `my-script.les`), **Copy link** (puts a
  rich-text link labelled with the description on the clipboard, with the bare URL as the plain-text alternative) and
  **Download** (saves the script as a file named after the description). Close it with ×, Esc or a click outside.
- The terminal is [xterm.js](https://xtermjs.org/). Line editing (echo, Backspace, Ctrl+U, Ctrl+D) is done by the page.
- Two buttons at the right end of the terminal's title bar help on a small screen. The first makes the
  terminal a fixed 80 columns wide and scrolls it sideways; the second shows the terminal full screen
  (Esc closes it; Run and Stop are repeated in its title bar). xterm.js 6 does not scroll its scrollback
  by touch, so the page does it: a vertical swipe scrolls the output, a sideways one scrolls the wide terminal,
  and at either end the page scrolls as usual.

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
| Same-repository PR opened, updated, reopened or closed (targeting `main`) | Reconciles production and all open PR previews |
| Hourly (at :23) | Compares the published production version and preview manifest with current refs; builds only when they differ |
| Manual (workflow_dispatch) | Builds the branch, tag or commit given as `les_ref` and publishes it |

After the build, `scripts/smoke.mjs` runs the real `worker.js` and `les.wasm` under Node.
If the playground's own checks fail (stdin, EOF, import, exit codes, the starter samples, the examples kept here), nothing is published.
If one of unak/les's examples fails, the run only reports a warning and still publishes.

### Pull request previews

After the Pages workflow is deployed on `main`, every open PR targeting `main` from a branch
in this repository has a preview at:

```text
https://gotoken.github.io/les-playground/pr-preview/pr-<number>/
```

The Pages workflow publishes production and all successful previews together, so scheduled
updates do not erase open previews. Closing a PR (including merging it) removes its preview
on the next successful deployment. Check the workflow run summary for published links.
A failed PR smoke test excludes that preview without blocking production; the hourly run
retries missing previews. Previews use the PR head, not a synthetic merge commit.
On PR events the current published upstream les SHA is reused if available; normal main
and scheduled deployments retain their existing upstream-update behavior.

Only trusted same-repository branches are eligible: GitHub Pages serves them from the
same origin as production. Do not enable fork previews without separate origin isolation.
Build jobs have read-only permissions, no shared dependency caches, and do not persist
checkout credentials; the deploy job publishes static artifacts without executing PR code.
This workflow rebuilds production and each open preview on reconciliation, even previews
whose code did not change.

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
- `web/examples/` — examples kept in this repository, registered in `scripts/examples.mjs`:
  `2048.les`, and `trace`, `real`, `spigot` and `lcs-dp` with one file per UI language (`*.en.les` / `*.ja.les`,
  which differ only in their comments, and for `trace` and `lcs-dp` also in the text they print; the page shows
  the one for the current UI language and swaps it on a language switch as long as it has not been edited)
- `scripts/build.sh`, `scripts/build.mjs` — build les.wasm and assemble the site in `dist/`
- `scripts/smoke.mjs` — smoke test run in CI before deploying

## Licenses

The published site ships the license texts of les (2-Clause BSD, taken from unak/les's README),
Go (`wasm_exec.js` and the runtime) and xterm.js (MIT), linked from the page footer.
