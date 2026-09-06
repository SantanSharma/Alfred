'use strict';

const commands = {
  skills: require('./commands/skills'),
  build: require('./commands/build'),
  sync: require('./commands/sync'),
};

const HELP = `Alfred: shared skills for AI CLIs, one source, every tool.

Usage:
  alfred skills                 List all skills.
  alfred build                  Validate skills and rebuild the skills index.
  alfred sync [--claude|--copilot]
                                Build plugin/ and connect it to Claude Code and GitHub Copilot.
                                Run after any skill change. Idempotent.

Runs from any directory; Alfred resolves its own install location.
`;

function run(argv) {
  const [command, ...args] = argv;
  const handler = commands[command];

  if (!handler) {
    console.log(HELP);
    if (command) process.exitCode = 1;
    return;
  }

  handler.run(args);
}

module.exports = { run };
