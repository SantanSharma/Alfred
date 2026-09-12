'use strict';

const fs = require('fs');
const path = require('path');

function normalize(p) {
  return path.resolve(p.replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, '').toLowerCase();
}

// Ensures linkPath is a directory link (NTFS junction on Windows, no admin needed)
// pointing at target. Returns 'ok' | 'created' | 'replaced'.
function ensureJunction(linkPath, target) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  let stat = null;
  try {
    stat = fs.lstatSync(linkPath);
  } catch {
    stat = null;
  }

  let replaced = false;
  if (stat) {
    if (stat.isSymbolicLink()) {
      if (normalize(fs.readlinkSync(linkPath)) === normalize(target)) return 'ok';
      fs.unlinkSync(linkPath);
    } else {
      throw new Error(`${linkPath} exists and is not a link; move it aside before syncing`);
    }
    replaced = true;
  }

  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  return replaced ? 'replaced' : 'created';
}

module.exports = { ensureJunction };
