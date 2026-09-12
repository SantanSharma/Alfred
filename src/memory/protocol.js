'use strict';

function normalize(payload, explicitTool) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const tool = explicitTool || (payload.toolName !== undefined || payload.sessionId !== undefined ? 'copilot' : 'claude');
  if (!['claude', 'copilot', 'codex'].includes(tool)) return null;
  let input = payload.tool_input ?? payload.toolArgs ?? {};
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return null; } }
  if (!input || typeof input !== 'object') return null;
  const toolName = payload.tool_name ?? payload.toolName;
  let skill = payload.command_name ?? input.skill ?? input.name;
  if (typeof skill === 'string') {
    skill = skill.replace(/^\/?alfred[:/ ]/, '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)) skill = null;
  } else skill = null;
  return {
    cwd: payload.cwd, tool, skill,
    sessionId: payload.session_id ?? payload.sessionId,
    eventId: payload.tool_use_id ?? payload.toolUseId ?? (payload.timestamp ? String(payload.timestamp) : undefined),
    source: payload.source,
    skillEvent: /^(Skill|skill)$/.test(toolName || '') || payload.hook_event_name === 'UserPromptExpansion',
    eventName: payload.hook_event_name,
    snakeCase: payload.hook_event_name !== undefined || payload.session_id !== undefined,
  };
}

function output(context, event, action) {
  if (!context) return '';
  if (event.tool === 'copilot' && !event.snakeCase) return JSON.stringify({ additionalContext: context });
  const eventName = event.eventName || ({ 'skill-start': 'PreToolUse', 'session-start': 'SessionStart' })[action];
  return JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: context } });
}

module.exports = { normalize, output };
