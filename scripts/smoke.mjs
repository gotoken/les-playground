// Smoke test for a built site: runs les.wasm through the real worker.js (in Node worker_threads)
// and checks what the playground itself relies on. Upstream examples that fail only warn,
// so a broken example in unak/les does not block the deploy.
//
//   node --liftoff-only scripts/smoke.mjs --site dist --les <unak/les checkout>
//
// --liftoff-only: Node 22's optimizing wasm tier was seen to crash intermittently on Go wasm;
// the baseline tier keeps CI deterministic. Browsers are not affected by this flag.
import { Worker } from "node:worker_threads";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import path from "node:path";
import { collect, root } from "./examples.mjs";

const { values: arg } = parseArgs({ options: { site: { type: "string" }, les: { type: "string" } } });
const site = path.resolve(arg.site || "dist");
const mod = await WebAssembly.compile(await readFile(path.join(site, "les.wasm")));
const { files, runnable, examples } = await collect(arg.les || "les");
const shim = path.join(root, "scripts", "node-worker-shim.cjs");
const enc = new TextEncoder();

function run(main, { input = [], argv = ["les", "/main.les"], extraFiles = {}, timeoutMs = 20000 } = {}) {
  return new Promise((resolve) => {
    const w = new Worker(shim, { workerData: { site } });
    const dec = { 1: new TextDecoder(), 2: new TextDecoder() };
    const res = { stdout: "", stderr: "", code: null, error: null };
    const queue = [...input];
    const timer = setTimeout(() => { res.error = `timed out after ${timeoutMs} ms`; w.terminate(); resolve(res); }, timeoutMs);
    const done = () => { clearTimeout(timer); w.terminate(); resolve(res); };
    w.on("error", (e) => { res.error = String(e); done(); });
    w.on("message", (m) => {
      if (m.type === "out") res[m.fd === 1 ? "stdout" : "stderr"] += dec[m.fd].decode(m.data, { stream: true });
      else if (m.type === "stdin-wait") {
        if (queue.length) w.postMessage({ type: "stdin", data: enc.encode(queue.shift()) });
        else w.postMessage({ type: "eof" });
      } else if (m.type === "exit") { res.code = m.code; done(); }
      else if (m.type === "error") { res.error = m.message; done(); }
    });
    w.postMessage({ type: "run", module: mod, argv, files: { ...files, ...extraFiles, "/main.les": main } });
  });
}

const checks = [
  ["les -v prints the version", async () => {
    const r = await run("", { argv: ["les", "-v"] });
    return r.code === 0 && /^les \S+ \(js\/wasm\)\n$/.test(r.stdout) ? null : r;
  }],
  ["hello.les reads a line from stdin", async () => {
    const r = await run(examples.hello, { input: ["テスト\n"] });
    return r.code === 0 && r.stdout.includes("こんにちは、テスト さん") ? null : r;
  }],
  ["stdin lines then EOF", async () => {
    const prog = "for:\n    line = gets()\n    if line is Nil:\n        break\n    print \"[\", line, \"]\\n\"\n";
    const r = await run(prog, { input: ["a\n", "b\n"] });
    return r.code === 0 && r.stdout === "[a]\n[b]\n" ? null : r;
  }],
  ["import from the virtual fs", async () => {
    const r = await run("import m\nprint m::X, \"\\n\"\n", { extraFiles: { "/m.les": "module m\n\nX = 42\n" } });
    return r.code === 0 && r.stdout === "42\n" ? null : r;
  }],
  ["exit code is passed through", async () => {
    const r = await run("print \"x\\n\"\nexit 3\n");
    return r.code === 3 && r.stdout === "x\n" ? null : r;
  }],
  ["syntax errors go to stderr with exit 1", async () => {
    const r = await run("print 1 +\n");
    return r.code === 1 && /Syntax Error/.test(r.stderr) ? null : r;
  }],
];

let failed = 0;
for (const [name, check] of checks) {
  const bad = await check();
  if (bad) { failed++; console.log(`FAIL ${name}\n${JSON.stringify(bad, null, 2)}`); }
  else console.log(`ok   ${name}`);
}

for (const name of runnable) {
  const r = await run(files[`/${name}.les`], { input: ["hello\n"] });
  if (r.code === 0) console.log(`ok   example ${name}.les`);
  else {
    const why = r.error || `exit ${r.code}: ${r.stderr.trim().split("\n").pop()}`;
    console.log(`::warning title=example ${name}.les::${why}`);
  }
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
