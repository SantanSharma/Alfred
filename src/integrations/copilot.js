'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const PATHS = require('../core/paths');
const { ensureJunction } = require('../core/junction');
const memoryHooks = require('./memoryHooks');

const MARKETPLACE_NAME = 'alfred';
const PLUGIN_NAME = 'alfred';
const COPILOT_HOME = path.join(os.homedir(), '.copilot');

// The CLI (>= 1.0.84) loads directory-marketplace plugins "live" from their source path.
// VS Code bundles an older runtime (1.0.81) with no live-plugin support; it resolves a
// plugin's folder as `cache_path || installed-plugins/<marketplace>/<name>`. A live plugin
// has no cache_path, so VS Code looks in that folder. A junction from there back to
// plugin/ makes VS Code see it while keeping it live.
const CACHE_LINK = path.join(COPILOT_HOME, 'installed-plugins', MARKETPLACE_NAME, PLUGIN_NAME);

function copilot(args, log) {
  const out = execFileSync('copilot', args, { encoding: 'utf8', stdio: 'pipe' });
  log.write(`$ copilot ${args.join(' ')}\n${out}`);
  return out;
}

function available() {
  try {
    execFileSync('copilot', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function ensureMarketplaceManifest() {
  const file = path.join(PATHS.root, '.github', 'plugin', 'marketplace.json');
  if (fs.existsSync(file)) return 'ok';

  const pkg = require(path.join(PATHS.root, 'package.json'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        name: MARKETPLACE_NAME,
        owner: { name: '', email: '' },
        metadata: { description: 'Alfred shared skills, local dev marketplace.', version: pkg.version },
        plugins: [{ name: PLUGIN_NAME, source: 'plugin', description: pkg.description, version: pkg.version }],
      },
      null,
      2
    )
  );
  return 'created';
}

function sync(log) {
  log.step('copilot: shared memory hooks (CLI and VS Code)', () => memoryHooks.install('copilot'));
  if (!available()) {
    log.skip('copilot', '"copilot" CLI not found on PATH; install GitHub Copilot CLI and re-run alfred sync');
    return;
  }

  log.step('copilot: marketplace manifest .github/plugin/marketplace.json', ensureMarketplaceManifest);

  log.step('copilot: register local marketplace', () => {
    if (copilot(['plugin', 'marketplace', 'list'], log).includes(`${MARKETPLACE_NAME} (Local:`)) return 'ok';
    copilot(['plugin', 'marketplace', 'add', PATHS.root], log);
    return 'added';
  });

  log.step('copilot: install plugin alfred@alfred', () => {
    if (copilot(['plugin', 'list'], log).includes(`${PLUGIN_NAME}@${MARKETPLACE_NAME}`)) return 'ok';
    copilot(['plugin', 'install', `${PLUGIN_NAME}@${MARKETPLACE_NAME}`], log);
    return 'installed';
  });

  log.step('copilot: junction ~/.copilot/installed-plugins/alfred/alfred -> plugin/ (for VS Code)', () =>
    ensureJunction(CACHE_LINK, PATHS.plugin)
  );
}

module.exports = { sync, CACHE_LINK };
