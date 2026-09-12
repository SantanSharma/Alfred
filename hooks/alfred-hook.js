#!/usr/bin/env node
'use strict';

const { createEngine } = require('../src/memory/engine');
const { normalize, output } = require('../src/memory/protocol');

function handle(action, payload, tool, engine = createEngine()) {
  const event = normalize(payload, tool);
  if (!event || !event.cwd || !event.sessionId) return '';
  if (action === 'skill-start') {
    if (!event.skillEvent || !event.skill) return '';
    const result = engine.start(event);
    return output(result?.context, event, action);
  }
  if (!['session-start', 'session-end'].includes(action)) return '';
  return output(engine.lifecycle({ ...event, action }), event, action);
}

if (require.main === module) {
  let input = '';
  let oversized = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (input.length + chunk.length > 1024 * 1024) oversized = true;
    if (!oversized) input += chunk;
  });
  process.stdin.on('end', () => {
    try {
      if (oversized) return;
      const result = handle(process.argv[2], JSON.parse(input.replace(/^\uFEFF/, '')), process.argv[3]);
      if (result) process.stdout.write(result + '\n');
    } catch (err) {
      // A broken memory file must never block a host tool call.
      process.stderr.write(`Alfred memory skipped: ${err.message}\n`);
    }
  });
  process.stdin.on('error', () => {});
}

module.exports = { handle };
