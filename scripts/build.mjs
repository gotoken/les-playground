// Assemble the static site: the page with build info and examples baked in, the worker,
// vendored xterm.js and the license notices. les.wasm and wasm_exec.js are put in --out by build.sh.
//
//   node scripts/build.mjs --les <unak/les checkout> --out <dir> --sha <commit> --version <les version> --go <go version> [--repo owner/name]
import { parseArgs } from "node:util";
import { readFile, writeFile, copyFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { collect, root } from "./examples.mjs";

const { values: arg } = parseArgs({
  options: {
    les: { type: "string" }, out: { type: "string" }, sha: { type: "string" },
    version: { type: "string" }, go: { type: "string" }, repo: { type: "string" },
  },
});
for (const k of ["les", "out", "sha", "version", "go"]) {
  if (!arg[k]) throw new Error(`--${k} is required`);
}

const out = path.resolve(arg.out);
const nm = path.join(root, "node_modules", "@xterm");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const exists = (p) => access(p).then(() => true, () => false);

// les ships its license in README.md (2-Clause BSD); prefer a LICENSE file if one appears later.
async function lesLicense() {
  for (const f of ["LICENSE", "LICENSE.txt", "LICENSE.md", "COPYING"]) {
    const p = path.join(arg.les, f);
    if (await exists(p)) return readFile(p, "utf8");
  }
  const readme = await readFile(path.join(arg.les, "README.md"), "utf8");
  const m = readme.match(/^## License\s*\n([\s\S]*?)(?=^---|^## |(?![\s\S]))/m);
  if (!m || !/Copyright/.test(m[1])) throw new Error("could not find the les license text in README.md");
  return m[1].replace(/^```\w*\n?/gm, "").trim() + "\n";
}

const { menu, examples, hello, files } = await collect(arg.les);
const build = { les_sha: arg.sha, les_version: arg.version, go: arg.go, menu, examples, hello, files };
const short = arg.sha.slice(0, 7);
const meta =
  `<a href="https://github.com/unak/les/commit/${esc(arg.sha)}">unak/les @ ${esc(short)}</a>` +
  ` · les ${esc(arg.version)} · GOOS=js GOARCH=wasm`;
const repoLink = arg.repo
  ? `<span><a href="https://github.com/${esc(arg.repo)}">${esc(arg.repo)}</a> · <a href="https://github.com/unak/les">unak/les</a></span>`
  : `<a href="https://github.com/unak/les">github.com/unak/les</a>`;

let html = await readFile(path.join(root, "web", "index.html"), "utf8");
const fill = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} not found in web/index.html`);
  html = html.replace(marker, () => value);
};
// The template carries a placeholder object after /*__BUILD__*/ so the page also opens unbuilt.
const buildRe = /\/\*__BUILD__\*\/\{[^\n]*\};/;
if (!buildRe.test(html)) throw new Error("BUILD placeholder not found in web/index.html");
html = html.replace(buildRe, () => JSON.stringify(build).replace(/</g, "\\u003c") + ";");
fill("__META__", meta);
fill("__REPO_LINK__", repoLink);

await mkdir(path.join(out, "vendor"), { recursive: true });
await writeFile(path.join(out, "index.html"), html);
await copyFile(path.join(root, "web", "worker.js"), path.join(out, "worker.js"));
await copyFile(path.join(nm, "xterm", "lib", "xterm.js"), path.join(out, "vendor", "xterm.js"));
await copyFile(path.join(nm, "xterm", "css", "xterm.css"), path.join(out, "vendor", "xterm.css"));
await copyFile(path.join(nm, "addon-fit", "lib", "addon-fit.js"), path.join(out, "vendor", "addon-fit.js"));
await copyFile(path.join(nm, "xterm", "LICENSE"), path.join(out, "LICENSE-xterm.txt"));
await writeFile(path.join(out, "LICENSE-les.txt"), await lesLicense());
await writeFile(
  path.join(out, "version.json"),
  JSON.stringify({
    les_sha: arg.sha,
    les_version: arg.version,
    go: arg.go,
    playground_sha: process.env.GITHUB_SHA || "local",
    built_at: new Date().toISOString(),
  }, null, 2) + "\n",
);
console.log(`site: ${out} (les ${arg.version} @ ${short}, ${arg.go}, ${menu.length} menu entries, ${Object.keys(files).length} files)`);
