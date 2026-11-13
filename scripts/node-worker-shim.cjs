// Runs the site's worker.js inside a Node worker_threads Worker, with just enough of the
// browser worker globals (self, postMessage, onmessage, importScripts) for the smoke test.
const { parentPort, workerData } = require("node:worker_threads");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const site = workerData.site;
globalThis.self = globalThis;
self.location = { search: "" };
self.postMessage = (msg, transfer) => parentPort.postMessage(msg, transfer);
globalThis.importScripts = (file) =>
  vm.runInThisContext(fs.readFileSync(path.join(site, file.split("?")[0]), "utf8"), { filename: file });
parentPort.on("message", (data) => self.onmessage({ data }));

// worker.js installs its own `process` for Go's syscall/js; hide Node's so that one is used.
Object.defineProperty(globalThis, "process", { value: undefined, writable: true, configurable: true });
vm.runInThisContext(fs.readFileSync(path.join(site, "worker.js"), "utf8"), { filename: "worker.js" });
