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

// Examples kept in this repository (web/examples/), with how the playground runs them.
//   file:  one file for every UI language, or
//   files: one file per UI language ({ en, ja }), e.g. the same program with translated comments
//   run.args: extra command-line arguments; "{seed}" becomes a fresh number on every run
//   run.keys: start in key input mode (every key press is sent as its own line, arrows as w/a/s/d)
//   expect: the exact stdout of each language version ({ en, ja }), checked by smoke.mjs;
//           without it, every language version must print the same thing
export const OWN = [
  {
    name: "trace",
    files: { en: "trace.en.les", ja: "trace.ja.les" },
    label: { en: "trace.les — see when values get computed", ja: "trace.les — いつ計算されるかを見る" },
    // The order of the "(computing ...)" lines is the point of this example.
    expect: {
      en: "assignments done\n  (computing b)\nb + b = 4\n  (computing then)\nmy_if = 10\n" +
        "  (computing 2)\nthird element of xs = 2\n",
      ja: "代入おわり\n  (b を計算)\nb + b = 4\n  (then を計算)\nmy_if = 10\n" +
        "  (2 を計算)\nxs の3番目 = 2\n",
    },
  },
  {
    name: "2048",
    file: "2048.les",
    label: { en: "2048.les — play with the arrow keys", ja: "2048.les — 矢印キーで遊ぶ" },
    run: { args: ["{seed}", "--raw"], keys: true },
  },
  {
    name: "real",
    files: { en: "real.en.les", ja: "real.ja.les" },
    label: { en: "real.les — constructive real numbers", ja: "real.les — 構成的実数" },
  },
  {
    name: "spigot",
    files: { en: "spigot.en.les", ja: "spigot.ja.les" },
    label: { en: "spigot.les — digits of π as an infinite stream", ja: "spigot.les — π の桁を無限ストリームで" },
  },
];

const readExample = (file) => readFile(path.join(root, "web", "examples", file), "utf8");

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

  // menu: [name, { en: label, ja: label }, run options?]
  // examples: name -> text, or name -> { en: text, ja: text } for per-language files
  const menu = [["hello", { en: "Getting started (interactive input)", ja: "はじめに（対話入力）" }]];
  const examples = {};
  for (const ex of OWN) {
    if (ex.files) {
      examples[ex.name] = {};
      for (const lang of LANGS) examples[ex.name][lang] = await readExample(ex.files[lang]);
    } else {
      examples[ex.name] = await readExample(ex.file);
    }
    menu.push(ex.run ? [ex.name, ex.label, ex.run] : [ex.name, ex.label]);
  }
  for (const name of runnable) {
    if (name in examples) continue;  // ours wins if unak/les ever ships one with the same name
    const label = {};
    for (const lang of LANGS) label[lang] = LABELS[name] ? `${name}.les — ${LABELS[name][lang]}` : `${name}.les`;
    menu.push([name, label]);
    examples[name] = files[`/${name}.les`];
  }
  return { menu, examples, hello, files, runnable };
}
