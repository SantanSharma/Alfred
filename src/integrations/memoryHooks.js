'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const PATHS = require('../core/paths');
const { writeJson } = require('../memory/storage');

const bashQuote = value => "'" + value.replace(/'/g, "'\\''") + "'";
const psQuote = value => "'" + value.replace(/'/g, "''") + "'";

function registrations(tool, root = PATHS.root) {
  const script = path.join(root, 'hooks', 'alfred-hook.js');
  const unix = script.replace(/\\/g, '/');
  const bashNode = process.platform === 'win32' ? 'node' : bashQuote(process.execPath);
  const command = action => `${bashNode} ${bashQuote(unix)} ${action} ${tool}`;
  const powershell = action => `& ${psQuote(process.execPath)} ${psQuote(script)} ${action} ${tool}`;
  const grouped = (action, matcher) => ({
    ...(matcher ? { matcher } : {}), hooks: [{ type: 'command',
      // Claude uses a shell command on Windows; node on PATH avoids quoted-exe parsing.
      command: tool === 'claude' && process.platform === 'win32'
        ? `node "${unix.replace(/["$`]/g, '\\$&')}" ${action} ${tool}` : command(action),
      ...(tool === 'codex' ? { command_windows: powershell(action) } : {}),
      timeout: action === 'session-end' ? 3 : 10,
    }],
  });
  if (tool === 'copilot') {
    const flat = (action, matcher) => ({ type: 'command', ...(matcher ? { matcher } : {}),
      bash: command(action), powershell: powershell(action), timeoutSec: action === 'session-end' ? 3 : 10 });
    return { sessionStart: [flat('session-start')], postToolUse: [flat('skill-start', '^skill$')], sessionEnd: [flat('session-end')] };
  }
  const hooks = { SessionStart: [grouped('session-start')], SessionEnd: [grouped('session-end')] };
  if (tool === 'claude') hooks.PreToolUse = [grouped('skill-start', '^Skill$')];
  // No fictional Codex Skill event: generated skill startup is the portable entry point.
  // Direct Claude slash commands use that same fallback on all Claude versions.
  return hooks;
}

function hookFile(tool, home = os.homedir()) {
  if (tool === 'claude') return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'settings.json');
  if (tool === 'copilot') return path.join(home, '.copilot', 'hooks', 'alfred.json');
  return path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'hooks.json');
}

function owned(handler, root) {
  if (!handler || typeof handler !== 'object') return false;
  const script = path.join(root, 'hooks', 'alfred-hook.js');
  const variants = [script, script.replace(/\\/g, '/'), script.replace(/'/g, "'\\''"), script.replace(/'/g, "''")];
  return ['command', 'command_windows', 'bash', 'powershell'].some(key =>
    typeof handler[key] === 'string' && variants.some(value => handler[key].includes(value)));
}

function mergeHooks(config, additions, root) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Hook config must be a JSON object');
  const result = structuredClone(config);
  if (result.hooks !== undefined && (!result.hooks || typeof result.hooks !== 'object' || Array.isArray(result.hooks))) {
    throw new Error('Invalid hooks object; existing settings were left unchanged');
  }
  result.hooks = result.hooks || {};
  for (const [event, groups] of Object.entries(result.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`Invalid hook event: ${event}`);
    result.hooks[event] = groups.flatMap(group => {
      if (group && Array.isArray(group.hooks)) {
        const handlers = group.hooks.filter(handler => !owned(handler, root));
        return handlers.length ? [{ ...group, hooks: handlers }] : [];
      }
      return owned(group, root) ? [] : [group];
    });
    if (!result.hooks[event].length) delete result.hooks[event];
  }
  for (const [event, entries] of Object.entries(additions)) result.hooks[event] = [...(result.hooks[event] || []), ...entries];
  if (!Object.keys(result.hooks).length) delete result.hooks;
  return result;
}

function install(tool, { file = hookFile(tool), root = PATHS.root, remove = false } = {}) {
  if (remove && !fs.existsSync(file)) return 'not installed';
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(`Refusing to replace linked settings: ${file}`);
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const config = raw ? JSON.parse(raw.replace(/^\uFEFF/, '')) : {};
  if (tool === 'copilot' && config.version !== undefined && config.version !== 1) throw new Error('Unsupported Copilot hooks version');
  const result = mergeHooks(config, remove ? {} : registrations(tool, root), root);
  if (!remove && tool === 'copilot') result.version = 1;
  if (JSON.stringify(config) === JSON.stringify(result)) return 'unchanged';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (remove && !result.hooks && Object.keys(result).every(key => key === 'version')) fs.unlinkSync(file);
  else writeJson(file, result);
  return `${remove ? 'removed owned hooks from' : 'configured'} ${file}`;
}

module.exports = { registrations, hookFile, mergeHooks, install };
