'use strict';

const { createEngine } = require('../memory/engine');

const HELP = `Usage:
  alfred memory start --skill <name> --tool <claude|copilot|codex> [--session <id>] [--cwd <path>] [--event <id>] [--refresh]
  alfred memory end --tool <claude|copilot|codex> --session <id> [--cwd <path>]

Prints shared memory and exact write-back paths. With no session ID, start returns a
new token: reuse it for later skills in this conversation. --event makes retries
idempotent. --refresh reloads all context after compaction. Hooks use this same engine.`;

function run(args) {
  if (!args.length || args.includes('--help') || args.includes('-h')) { console.log(HELP); return; }
  try {
    const [action, ...rest] = args;
    const options = {};
    for (let i = 0; i < rest.length; i++) {
      const key = rest[i];
      if (key === '--refresh') { options.refresh = true; continue; }
      if (!['--skill', '--tool', '--session', '--cwd', '--event'].includes(key) || !rest[i + 1] || rest[i + 1].startsWith('--')) {
        throw new Error(`Invalid memory option: ${key}`);
      }
      options[key.slice(2)] = rest[++i];
    }
    if (!['start', 'end'].includes(action) || !['claude', 'copilot', 'codex'].includes(options.tool)) throw new Error(HELP);
    if (action === 'start' && !options.skill || action === 'end' && !options.session) throw new Error(HELP);
    const event = {
      cwd: options.cwd || process.cwd(), tool: options.tool, skill: options.skill,
      sessionId: options.session || (options.tool === 'codex' ? process.env.CODEX_THREAD_ID : undefined),
      eventId: options.event, refresh: options.refresh,
    };
    const engine = createEngine();
    if (action === 'end') engine.lifecycle({ ...event, action: 'session-end' });
    else {
      const result = engine.start(event);
      console.log(result ? result.context : 'Alfred memory inactive (opt-out, unknown skill, or excluded workspace). Continue the skill normally.');
    }
  } catch (err) {
    console.error(`Alfred memory: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run };
