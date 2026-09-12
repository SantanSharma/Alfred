'use strict';

const os = require('os');
const path = require('path');
const PATHS = require('../core/paths');
const { ensureJunction } = require('../core/junction');
const memoryHooks = require('./memoryHooks');

// Claude Code auto-loads every folder under ~/.claude/skills/ as a plugin, in both the
// terminal CLI and the VS Code extension (same program, same config dir). A junction
// there is the whole registration.
const SKILLS_LINK = path.join(os.homedir(), '.claude', 'skills', 'alfred');

function sync(log) {
  log.step('claude: shared memory hooks', () => memoryHooks.install('claude'));
  log.step('claude: junction ~/.claude/skills/alfred -> plugin/', () =>
    ensureJunction(SKILLS_LINK, PATHS.plugin)
  );
}

module.exports = { sync, SKILLS_LINK };
