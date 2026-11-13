// Shared by build.mjs and smoke.mjs: read the .les files that make up the playground.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const LANGS = ["en", "ja"];

// Short descriptions for examples we know; anything new in unak/les/examples is listed by file name.
const LABELS = {
  mvp_demo: { en: "lazy evaluation", ja: "遅延評価" },
  lambda_demo: { en: "lambdas", ja: "ラムダ" },
  echo: { en: "read stdin until EOF", ja: "EOF まで stdin を読む" },
  main_import: { en: "import mymath", ja: "import mymath" },
};
const ORDER = Object.keys(LABELS);

// A file that declares `module <name>` is a library for `import`, not a program to run.
const isModule = (text) => /^module\s+\w+/m.test(text);

export async function collect(lesDir) {
  const exDir = path.join(lesDir, "examples");
  const files = {};
  const runnable = [];
  for (const f of (await readdir(exDir)).filter((f) => f.endsWith(".les")).sort()) {
    const text = await readFile(path.join(exDir, f), "utf8");
    files[`/${f}`] = text;
    if (!isModule(text)) runnable.push(f.slice(0, -4));
  }
  runnable.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    if (ia !== ib) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.localeCompare(b);
  });

  // The starter sample is ours and comes in each UI language: web/hello.<lang>.les
  const hello = {};
  for (const lang of LANGS) hello[lang] = await readFile(path.join(root, "web", `hello.${lang}.les`), "utf8");

  // menu: [name, { en: label, ja: label }]
  const menu = [["hello", { en: "Getting started (interactive input)", ja: "はじめに（対話入力）" }]];
  const examples = {};
  for (const name of runnable) {
    const label = {};
    for (const lang of LANGS) label[lang] = LABELS[name] ? `${name}.les — ${LABELS[name][lang]}` : `${name}.les`;
    menu.push([name, label]);
    examples[name] = files[`/${name}.les`];
  }
  return { menu, examples, hello, files, runnable };
}
