'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

function read(file, fallback = '', complete = false) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe memory file: ${file}`);
    if (complete && stat.size > 65536) throw new Error(`Memory file exceeds 64 KiB; shorten it before updating: ${file}`);
    // Bound allocation even when a note has accidentally become a transcript.
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(stat.size, 65536));
      const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.subarray(0, count).toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function json(file, fallback = {}) {
  return JSON.parse(read(file, JSON.stringify(fallback)).replace(/^\uFEFF/, ''));
}

function safeDirectory(dir) {
  try {
    const stat = fs.lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe memory directory: ${dir}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    try { fs.mkdirSync(dir); }
    catch (createError) {
      if (createError.code !== 'EEXIST') throw createError;
      const stat = fs.lstatSync(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe memory directory: ${dir}`);
    }
  }
}

function write(file, text) {
  try {
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Unsafe memory file: ${file}`);
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, text, { flag: 'wx', mode: 0o600 });
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function writeJson(file, value) { write(file, JSON.stringify(value, null, 2) + '\n'); }

function resolveRoot(cwd, { home = os.homedir(), temp = os.tmpdir() } = {}) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return null;
  let start;
  try { start = fs.realpathSync(cwd); } catch { return null; }
  if (!fs.statSync(start).isDirectory()) return null;
  let dir = start;
  let gitRoot;
  let root;
  // An explicit nearest notebook overrides the nearest git boundary.
  while (true) {
    if (fs.existsSync(path.join(dir, '.alfred'))) { root = dir; break; }
    if (!gitRoot && fs.existsSync(path.join(dir, '.git'))) gitRoot = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  root = root || gitRoot || start;
  const canonical = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const same = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if ([home, temp, path.parse(root).root].some(p => same(root, canonical(p)))) return null;
  return root;
}

function layout(root) {
  const base = path.join(root, '.alfred');
  safeDirectory(base);
  for (const name of ['sessions', 'feedback', '.state']) safeDirectory(path.join(base, name));
  for (const [name, text] of Object.entries({
    '.gitignore': '*\n',
    'README.md': '# Alfred workspace memory\n\nShared by Claude, Copilot and Codex. Local only.\n'
      + 'memory.md: dated project facts.\nsessions/: short results and open work.\n'
      + 'feedback/: usage counters and explicit user feedback.\n.state/: private bookkeeping.\n'
      + 'Set config.json to {"memory":false} to disable.\n'
      + 'Alfred never edits project instruction files. Back up these notes if needed.\n',
    'memory.md': '# Project memory\n',
  })) {
    const file = path.join(base, name);
    try { fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 }); }
    catch (err) { if (err.code !== 'EEXIST') throw err; }
  }
  return base;
}

function withLock(base, fn) {
  const file = path.join(base, '.state', 'write.lock');
  const deadline = Date.now() + 800;
  while (true) {
    try { fs.mkdirSync(file); break; }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      // A crashed process must not permanently disable memory.
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe memory lock');
      if (Date.now() - stat.mtimeMs > 30000) { fs.rmdirSync(file); continue; }
      if (Date.now() >= deadline) throw new Error('Memory is busy; retry shortly');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try { return fn(); } finally { fs.rmdirSync(file); }
}

module.exports = { read, json, write, writeJson, resolveRoot, layout, withLock, safeDirectory };
