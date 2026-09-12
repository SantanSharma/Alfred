#!/usr/bin/env node
'use strict';
const { install } = require('../src/integrations/memoryHooks');
for (const tool of ['claude', 'copilot', 'codex']) {
  try { console.log(`${tool}: ${install(tool, { remove: true })}`); }
  catch (err) { console.error(`${tool}: ${err.message}`); process.exitCode = 1; }
}
