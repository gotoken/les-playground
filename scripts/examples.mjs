// Shared by build.mjs and smoke.mjs: read the .les files that make up the playground.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Short descriptions for examples we know; anything new in unak/les/examples is listed by file name.
const LABELS = {
  mvp_demo: "遅延評価",
  lambda_demo: "ラムダ",
  echo: "EOF まで stdin を読む",
  main_import: "import mymath",
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
    const name = f.slice(0, -4);
    files[`/${f}`] = text;
    if (!isModule(text)) runnable.push(name);
  }
  runnable.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    if (ia !== ib) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
    return a.localeCompare(b);
  });

  const hello = await readFile(path.join(root, "web", "hello.les"), "utf8");
  const menu = [["hello", "はじめに（対話入力）"]];
  const examples = { hello };
  for (const name of runnable) {
    menu.push([name, LABELS[name] ? `${name}.les — ${LABELS[name]}` : `${name}.les`]);
    examples[name] = files[`/${name}.les`];
  }
  return { menu, examples, files, runnable };
}
