'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PATHS = require('../core/paths');
const store = require('./storage');

const DEFAULTS = { globalLines: 20, memoryLines: 40, improvementLines: 8, recentSessions: 2, maxSessions: 30 };
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SESSION_FILE = /^\d{4}-\d{2}-\d{2}T[\d-]+Z-(claude|copilot|codex)-[a-f0-9]{24}\.md$/;
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);

function settings(root) {
  const file = path.join(root, '.alfred', 'config.json');
  const config = store.json(file);
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid .alfred/config.json');
  const caps = { ...DEFAULTS };
  for (const key of Object.keys(caps)) {
    const value = config.caps?.[key];
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 0 || value > 1000) throw new Error(`Invalid memory cap: ${key}`);
      caps[key] = value;
    }
  }
  return { enabled: config.memory !== false, caps };
}

function section(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^##?\s/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function bounded(text, lines, chars) {
  const facts = text.split(/\r?\n/).filter(line => line.trim() && !/^#/.test(line));
  const selected = facts.slice(0, lines).map(line => line.slice(0, 300)).join('\n');
  const overflow = facts.length > lines || selected.length > chars || facts.some(line => line.length > 300);
  return selected.slice(0, chars) + (overflow ? '\n[Memory capped; consolidate dated facts in place.]' : '');
}

function feedback(base, skill) {
  const file = path.join(base, 'feedback', `${skill}.md`);
  let text = store.read(file, `# ${skill}\nuses: 0\nlast:\nrated_good: 0\nrated_bad: 0\n\n## Improvements\n\n## Notes\n`, true);
  const match = text.match(/^uses:[ \t]*(\d+)[ \t]*\r?$/m);
  const uses = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(uses + 1) || !/^last:/m.test(text)) throw new Error(`Invalid feedback counters: ${file}`);
  text = text.replace(/^uses:.*$/m, `uses: ${uses + 1}`).replace(/^last:.*$/m, `last: ${new Date().toISOString().slice(0, 10)}`);
  store.write(file, text);
  return file;
}

function sessionState(base, key) {
  const state = store.json(path.join(base, '.state', `${key}.json`), null);
  if (state && (!SESSION_FILE.test(state.file) || !Array.isArray(state.skills) || !Array.isArray(state.events))) {
    throw new Error('Invalid Alfred session state');
  }
  return state;
}

function prune(base, caps, currentKey) {
  const active = new Set();
  for (const entry of fs.readdirSync(path.join(base, '.state'))) {
    if (!/^[a-f0-9]{24}\.json$/.test(entry)) continue;
    const file = path.join(base, '.state', entry);
    const state = sessionState(base, entry.slice(0, -5));
    if (entry === `${currentKey}.json` || Date.now() - Number(state.updated) < 7 * 86400000) active.add(state.file);
    else fs.unlinkSync(file);
  }
  const sessions = fs.readdirSync(path.join(base, 'sessions')).filter(name => SESSION_FILE.test(name)).sort().reverse();
  let retained = sessions.filter(name => active.has(name)).length;
  for (const name of sessions) {
    if (active.has(name)) continue;
    const file = path.join(base, 'sessions', name);
    if (!section(store.read(file), 'Summary') || retained >= caps.maxSessions) fs.unlinkSync(file);
    else retained++;
  }
}

function createEngine(paths = PATHS, rootOptions = {}) {
  function workspace(cwd) {
    if ((process.env.ALFRED_MEMORY || '').toLowerCase() === 'off') return null;
    const root = store.resolveRoot(cwd, rootOptions);
    if (!root) return null;
    const existing = path.join(root, '.alfred');
    if (fs.existsSync(existing) && fs.lstatSync(existing).isSymbolicLink()) throw new Error('Linked .alfred folders are not supported');
    const config = settings(root);
    return config.enabled ? { root, ...config } : null;
  }

  function start({ cwd, tool, skill, sessionId, eventId, refresh = false }) {
    if (!['claude', 'copilot', 'codex'].includes(tool) || !SKILL_NAME.test(skill || '')) return null;
    const index = store.json(paths.skillsIndex, { skills: [] });
    const definition = index.skills.find(s => s.name === skill);
    if (!definition || definition.memory === false) return null;
    const ws = workspace(cwd);
    if (!ws) return null;
    const base = store.layout(ws.root);
    const id = sessionId || crypto.randomUUID();
    const key = hash(`${tool}:${id}`);
    return store.withLock(base, () => {
      const stateFile = path.join(base, '.state', `${key}.json`);
      let state = sessionState(base, key);
      const first = !state || refresh || state.refresh;
      if (!state) state = {
        file: `${new Date().toISOString().replace(/[:.]/g, '-')}-${tool}-${key}.md`,
        skills: [], events: [], updated: Date.now(),
      };
      const event = eventId ? hash(`${skill}:${eventId}`) : null;
      const duplicate = event && state.events.includes(event);
      const feedbackFile = path.join(base, 'feedback', `${skill}.md`);
      if (!duplicate) feedback(base, skill);
      if (event && !duplicate) state.events = [...state.events, event].slice(-256);
      if (!state.skills.includes(skill)) state.skills.push(skill);
      state.updated = Date.now();
      state.refresh = false;
      const sessionFile = path.join(base, 'sessions', state.file);
      let sessionText = store.read(sessionFile, 'skills: \n', true);
      sessionText = sessionText.replace(/^skills:.*$/m, `skills: ${state.skills.join(', ')}`);
      store.write(sessionFile, sessionText);
      store.writeJson(stateFile, state);
      prune(base, ws.caps, key);

      const receipt = `Alfred memory ready: ${skill}\nTool: ${tool}; session: ${id}\n`
        + `Workspace memory: ${path.join(base, 'memory.md')}\nGlobal memory: ${path.join(paths.memory, 'global.md')}\n`
        + `Session summary: ${sessionFile}\nFeedback: ${feedbackFile}\n`
        + 'Do not run the generated startup step again for this invocation. Reuse this session ID for later skills.\n';
      const improvements = bounded(section(store.read(feedbackFile), 'Improvements'), ws.caps.improvementLines, 700);
      const parts = [receipt];
      if (first) {
        parts.push('## Alfred core rules\n' + store.read(path.join(paths.knowledge, 'alfred-core.md')).slice(0, 3000));
        parts.push('## Global facts\n' + bounded(store.read(path.join(paths.memory, 'global.md')), ws.caps.globalLines, 1100));
        parts.push('## Project facts\n' + bounded(store.read(path.join(base, 'memory.md')), ws.caps.memoryLines, 2200));
      } else parts.push('Alfred rules already loaded. Follow the memory, summary and explicit-user-feedback contract.');
      parts.push('## Skill improvements\n' + improvements);
      if (first) {
        const recent = fs.readdirSync(path.join(base, 'sessions')).filter(name => name.endsWith('.md') && name !== state.file)
          .sort().reverse().map(name => ({ name, summary: section(store.read(path.join(base, 'sessions', name)), 'Summary') }))
          .filter(item => item.summary).slice(0, ws.caps.recentSessions);
        parts.push('## Recent results\n' + recent.map(item => `${item.name}\n${bounded(item.summary, 6, 500)}`).join('\n').slice(0, 1100));
      }
      return { context: parts.join('\n\n'), sessionId: id, sessionFile, feedbackFile, root: ws.root };
    });
  }

  function lifecycle({ cwd, tool, sessionId, action, source }) {
    const ws = workspace(cwd);
    if (!ws || !fs.existsSync(path.join(ws.root, '.alfred'))) return null;
    const base = store.layout(ws.root);
    if (sessionId) {
      store.withLock(base, () => {
        const key = hash(`${tool}:${sessionId}`);
        const state = sessionState(base, key);
        if (state && action === 'session-end') fs.unlinkSync(path.join(base, '.state', `${key}.json`));
        if (state && action === 'session-start' && ['compact', 'resume', 'clear'].includes(source)) {
          state.refresh = true;
          store.writeJson(path.join(base, '.state', `${key}.json`), state);
        }
        prune(base, ws.caps, action === 'session-end' ? null : key);
      });
    }
    return action === 'session-start' ? `Alfred workspace notes exist at ${base}; load them only when an Alfred skill runs.` : null;
  }
  return { start, lifecycle };
}

module.exports = { createEngine, section, bounded, DEFAULTS };
