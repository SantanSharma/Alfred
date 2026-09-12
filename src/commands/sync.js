'use strict';

const PATHS = require('../core/paths');
const { RunLog } = require('../core/log');
const { buildPlugin } = require('../core/pluginBuild');
const claude = require('../integrations/claude');
const copilot = require('../integrations/copilot');
const codex = require('../integrations/codex');

const TOOLS = ['claude', 'copilot', 'codex'];

const USAGE = `Usage: alfred sync [--claude] [--copilot] [--codex]

Builds plugin/ from skills/, then connects it to every supported tool.
No flags = all tools. Idempotent, safe to re-run after any skill change.`;

function run(args) {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const only = args.filter((a) => a.startsWith('--') && TOOLS.includes(a.slice(2)));
  const wants = (tool) => only.length === 0 || only.includes(`--${tool}`);

  const log = new RunLog('sync');

  const built = log.step('build plugin/ from skills/', () => `${buildPlugin()} skill(s)`);
  if (!built) return finish(log);

  if (wants('claude')) claude.sync(log);
  if (wants('copilot')) copilot.sync(log);
  if (wants('codex')) codex.sync(log);

  finish(log);
}

function finish(log) {
  console.log('');
  if (log.failed) {
    console.log(`Sync finished with failures. Full log: ${log.file}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Sync OK. Skills live at ${PATHS.plugin}`);
  console.log('  Memory: generated startup works across all three tools; native hooks add automatic context/cleanup.');
  console.log('  Codex lifecycle hooks may require review in /hooks. Skill memory also works through the generated startup.');
  console.log('  Claude Code:  /alfred:<skill>   then /reload-plugins (or new session)');
  console.log('  Copilot:      /alfred <skill>    terminal immediate; VS Code new chat, or restart once after first setup');
  console.log('  Codex:        $alfred:<skill>    or "/" then pick under Skills; after sync run "Force reload skills" (Codex command menu) or restart VS Code');
  console.log('Never run "copilot plugin uninstall alfred": its plugin dir is a junction into plugin/.');
}

module.exports = { run };
