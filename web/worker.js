// worker.js — runs one les program per Worker instance.
//
// The les binary is the unmodified cmd/les built with GOOS=js GOARCH=wasm.
// Go's syscall/js file I/O goes through globalThis.fs (Node's callback API),
// so this file provides a small in-memory, read-only fs plus a blocking stdin:
// a read on fd 0 with no data simply holds its callback until the page sends
// input. The Go goroutine waits on that callback and the worker's event loop
// keeps running, so no SharedArrayBuffer / Atomics are needed.
"use strict";

const S_IFDIR = 0o040000, S_IFREG = 0o100000, S_IFCHR = 0o020000;
const O_WRONLY = 1, O_RDWR = 2, O_CREAT = 64, O_EXCL = 128, O_TRUNC = 512, O_APPEND = 1024, O_DIRECTORY = 65536;

const files = new Map();      // abs path -> Uint8Array
const dirs = new Set(["/"]);  // abs paths of directories
const fds = new Map();        // fd -> { path, pos }
let nextFd = 10;

const stdinChunks = [];
let stdinEOF = false;
let pendingRead = null;

function fsErr(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

function norm(p) {
  const out = [];
  for (const seg of String(p).split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop(); else out.push(seg);
  }
  return "/" + out.join("/");
}

function mkStat(mode, size) {
  return {
    dev: 1, ino: 0, mode, nlink: 1, uid: 0, gid: 0, rdev: 0,
    size, blksize: 4096, blocks: Math.ceil(size / 512),
    atimeMs: 0, mtimeMs: 0, ctimeMs: 0,
    isDirectory() { return (mode & 0o170000) === S_IFDIR; },
  };
}

function statPath(p) {
  p = norm(p);
  if (files.has(p)) return mkStat(S_IFREG | 0o644, files.get(p).length);
  if (dirs.has(p)) return mkStat(S_IFDIR | 0o755, 0);
  return null;
}

function addFile(path, text) {
  path = norm(path);
  files.set(path, new TextEncoder().encode(text));
  let d = path;
  while ((d = d.slice(0, d.lastIndexOf("/")) || "/") !== "/") dirs.add(d);
}

function post(msg, transfer) {
  self.postMessage(msg, transfer || []);
}

function emit(fd, buf, offset, length) {
  const copy = buf.slice(offset, offset + length);
  post({ type: "out", fd, data: copy }, [copy.buffer]);
  return length;
}

function fulfillRead() {
  if (!pendingRead) return;
  const { buffer, offset, length, cb } = pendingRead;
  if (stdinChunks.length) {
    let n = 0;
    while (n < length && stdinChunks.length) {
      const c = stdinChunks[0];
      const k = Math.min(c.length, length - n);
      buffer.set(c.subarray(0, k), offset + n);
      n += k;
      if (k === c.length) stdinChunks.shift(); else stdinChunks[0] = c.subarray(k);
    }
    pendingRead = null;
    post({ type: "stdin-resume" });
    cb(null, n);
  } else if (stdinEOF) {
    pendingRead = null;
    post({ type: "stdin-resume" });
    cb(null, 0);
  }
}

globalThis.fs = {
  constants: { O_WRONLY, O_RDWR, O_CREAT, O_TRUNC, O_APPEND, O_EXCL, O_DIRECTORY },

  writeSync(fd, buf) {
    if (fd === 1 || fd === 2) return emit(fd, buf, 0, buf.length);
    throw fsErr("EBADF");
  },
  write(fd, buf, offset, length, position, cb) {
    if (fd === 1 || fd === 2) return cb(null, emit(fd, buf, offset, length));
    cb(fsErr(fds.has(fd) ? "EROFS" : "EBADF"));
  },
  read(fd, buffer, offset, length, position, cb) {
    if (fd === 0) {
      pendingRead = { buffer, offset, length, cb };
      if (!stdinChunks.length && !stdinEOF) post({ type: "stdin-wait" });
      fulfillRead();
      return;
    }
    const f = fds.get(fd);
    if (!f) return cb(fsErr("EBADF"));
    const data = files.get(f.path);
    if (!data) return cb(fsErr("EISDIR"));
    const start = position === null || position === undefined ? f.pos : Number(position);
    const n = Math.max(0, Math.min(length, data.length - start));
    buffer.set(data.subarray(start, start + n), offset);
    if (position === null || position === undefined) f.pos += n;
    cb(null, n);
  },
  open(path, flags, mode, cb) {
    const p = norm(path);
    if (flags & (O_WRONLY | O_RDWR | O_CREAT | O_TRUNC | O_APPEND)) return cb(fsErr("EROFS"));
    if (!statPath(p)) return cb(fsErr("ENOENT"));
    const fd = nextFd++;
    fds.set(fd, { path: p, pos: 0 });
    cb(null, fd);
  },
  close(fd, cb) {
    if (fd <= 2) return cb(null);
    if (!fds.delete(fd)) return cb(fsErr("EBADF"));
    cb(null);
  },
  fstat(fd, cb) {
    if (fd <= 2) return cb(null, mkStat(S_IFCHR | 0o620, 0));
    const f = fds.get(fd);
    if (!f) return cb(fsErr("EBADF"));
    cb(null, statPath(f.path));
  },
  stat(path, cb) {
    const st = statPath(path);
    st ? cb(null, st) : cb(fsErr("ENOENT"));
  },
  lstat(path, cb) { this.stat(path, cb); },
  readdir(path, cb) {
    const p = norm(path);
    if (!dirs.has(p)) return cb(fsErr("ENOTDIR"));
    const prefix = p === "/" ? "/" : p + "/";
    const names = new Set();
    for (const k of [...files.keys(), ...dirs]) {
      if (k !== p && k.startsWith(prefix)) names.add(k.slice(prefix.length).split("/")[0]);
    }
    cb(null, [...names].sort());
  },
  fsync(fd, cb) { cb(null); },
};
for (const name of ["chmod", "chown", "fchmod", "fchown", "ftruncate", "lchown", "link", "mkdir",
                    "readlink", "rename", "rmdir", "symlink", "truncate", "unlink", "utimes"]) {
  globalThis.fs[name] = (...args) => args[args.length - 1](fsErr("EROFS"));
}

globalThis.process = {
  getuid() { return -1; }, getgid() { return -1; }, geteuid() { return -1; }, getegid() { return -1; },
  getgroups() { throw fsErr("ENOSYS"); },
  pid: -1, ppid: -1,
  umask() { return 0o022; },
  cwd() { return "/"; },
  chdir() { throw fsErr("ENOSYS"); },
};

globalThis.path = {
  resolve(...segs) {
    let p = "/";
    for (const s of segs) p = String(s).startsWith("/") ? s : p + "/" + s;
    return norm(p);
  },
};

// Carry the page's cache-busting query (?v=<les commit>) over to wasm_exec.js.
importScripts("wasm_exec.js" + self.location.search);

let started = false;

self.onmessage = async (ev) => {
  const msg = ev.data;
  switch (msg.type) {
    case "run": {
      if (started) return;
      started = true;
      try {
        for (const [p, text] of Object.entries(msg.files || {})) addFile(p, text);
        const mod = msg.module instanceof WebAssembly.Module
          ? msg.module
          : await WebAssembly.compile(msg.bytes);
        const go = new Go();
        go.argv = msg.argv || ["les", "/main.les"];
        go.env = { HOME: "/", PWD: "/" };
        let exitCode = 0;
        go.exit = (code) => { exitCode = code; };
        const inst = await WebAssembly.instantiate(mod, go.importObject);
        post({ type: "started" });
        await go.run(inst);
        post({ type: "exit", code: exitCode });
      } catch (e) {
        post({ type: "error", message: String(e && e.stack || e) });
      }
      break;
    }
    case "stdin":
      if (msg.data && msg.data.length) stdinChunks.push(msg.data);
      fulfillRead();
      break;
    case "eof":
      stdinEOF = true;
      fulfillRead();
      break;
  }
};
