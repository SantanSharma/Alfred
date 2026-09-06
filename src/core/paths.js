'use strict';

const path = require('path');

// Root of the installed package, resolved from this file's real location.
// Works from any cwd, and whether installed via `npm link` (symlink) or
// `npm install -g .` (copy) — Node resolves __dirname through the real path.
const ROOT = path.resolve(__dirname, '..', '..');

const PATHS = {
  root: ROOT,
  skills: path.join(ROOT, 'skills'),
  knowledge: path.join(ROOT, 'knowledge'),
  memory: path.join(ROOT, 'memory'),
  config: path.join(ROOT, 'config'),
  plugin: path.join(ROOT, 'plugin'),
  logs: path.join(ROOT, 'logs'),
  skillsIndex: path.join(ROOT, 'config', 'skills-index.json'),
};

module.exports = PATHS;
