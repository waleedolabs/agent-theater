'use strict';
// Adds / removes Agent Theater's http hooks in ~/.claude/settings.json.
// Everything else in the user's settings is left untouched, and a backup is written first.
const fs = require('fs');
const crypto = require('crypto');
const P = require('./paths');

const EVENTS = {
  SessionStart: { timeout: 5 },
  UserPromptSubmit: { timeout: 5 },
  PreToolUse: { matcher: '*', timeout: 5 },
  PostToolUse: { matcher: '*', timeout: 5 },
  PostToolUseFailure: { matcher: '*', timeout: 5 },
  PermissionRequest: { matcher: '*', timeout: 45 },
  Notification: { timeout: 5 },
  Stop: { timeout: 5 },
};
const isOurs = h => h && h.type === 'http' && typeof h.url === 'string' && /127\.0\.0\.1:\d+\/hook\//.test(h.url);

function loadConfig() {
  for (const f of [P.CONFIG, P.LEGACY_CONFIG]) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {}
  }
  return {};
}
function saveConfig(cfg) {
  fs.mkdirSync(P.HOME_DIR, { recursive: true });
  fs.writeFileSync(P.CONFIG, JSON.stringify(cfg, null, 2));
}

function readSettings() {
  if (!fs.existsSync(P.SETTINGS)) return {};
  const raw = fs.readFileSync(P.SETTINGS, 'utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch (_) { throw new Error(`Can't parse ${P.SETTINGS} (invalid JSON). Fix it and try again; nothing was changed.`); }
}
function writeSettings(s) {
  fs.mkdirSync(P.CLAUDE_DIR, { recursive: true });
  if (fs.existsSync(P.SETTINGS)) fs.copyFileSync(P.SETTINGS, P.SETTINGS + '.backup-agent-theater');
  fs.writeFileSync(P.SETTINGS, JSON.stringify(s, null, 2));
}

function isInstalled(port) {
  try {
    const s = readSettings();
    const cfg = loadConfig();
    const want = `http://127.0.0.1:${port}/hook/${cfg.token}`;
    return Object.keys(EVENTS).every(ev => (s.hooks?.[ev] || []).some(g => (g.hooks || []).some(h => h.url === want)));
  } catch (_) { return false; }
}

function install(port) {
  const cfg = loadConfig();
  if (!cfg.token) cfg.token = crypto.randomBytes(16).toString('hex');
  cfg.port = port;
  const settings = readSettings();
  const url = `http://127.0.0.1:${port}/hook/${cfg.token}`;
  settings.hooks = settings.hooks || {};
  for (const [event, opt] of Object.entries(EVENTS)) {
    const groups = (settings.hooks[event] || [])
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !isOurs(h)) }))
      .filter(g => g.hooks.length);
    const group = { hooks: [{ type: 'http', url, timeout: opt.timeout }] };
    if (opt.matcher) group.matcher = opt.matcher;
    groups.push(group);
    settings.hooks[event] = groups;
  }
  writeSettings(settings);
  saveConfig(cfg);
  return cfg;
}

function uninstall() {
  const settings = readSettings();
  let removed = 0;
  for (const event of Object.keys(settings.hooks || {})) {
    settings.hooks[event] = settings.hooks[event]
      .map(g => { const n = (g.hooks || []).length; const hooks = (g.hooks || []).filter(h => !isOurs(h)); removed += n - hooks.length; return { ...g, hooks }; })
      .filter(g => g.hooks.length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (removed) writeSettings(settings);
  return removed;
}

module.exports = { install, uninstall, isInstalled, loadConfig };
