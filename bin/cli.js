#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const hooks = require('../lib/hooks');
const P = require('../lib/paths');

const argv = process.argv.slice(2);
const flag = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : def; };
const cmd = argv.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || 'start';
const cfg = hooks.loadConfig();
const port = Number(flag('port', process.env.THEATER_PORT || cfg.port || 4317));
const waitSec = Number(flag('wait', process.env.THEATER_WAIT_SEC || 30));
const planHint = argv.includes('--plan') || process.env.THEATER_PLAN === '1';
const saveSessions = argv.includes('--save-sessions');
const url = `http://127.0.0.1:${port}`;

const say = (...l) => console.log(l.join('\n'));
function openBrowser(u) {
  if (flag('no-open', false)) return;
  const [c, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { spawn(c, a, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); } catch (_) {}
}

async function alreadyRunning() {
  try { const r = await fetch(url + '/health'); return r.ok && (await r.json()).ok; } catch (_) { return false; }
}

async function start() {
  let freshInstall = false;
  if (!hooks.isInstalled(port)) { hooks.install(port); freshInstall = true; }
  if (await alreadyRunning()) { say('', '  🎬 Agent Theater is already running → ' + url, ''); openBrowser(url); return; }
  const { token } = hooks.loadConfig();
  const { start: startServer } = require('../lib/server');
  try {
    await startServer({ port, token, waitSec, planHint, saveSessions, installed: true, htmlFile: path.join(__dirname, '..', 'web', 'theater.html') });
  } catch (e) {
    if (e.code === 'EADDRINUSE') { say(`  Port ${port} is in use. Try another one with --port 4318`); process.exit(1); }
    throw e;
  }
  try { fs.mkdirSync(P.HOME_DIR, { recursive: true }); fs.writeFileSync(P.PID, String(process.pid)); } catch (_) {}
  say('',
    '  🎬  Agent Theater  ·  مسرح الوكيل',
    '  ' + url,
    '',
    freshInstall ? '  ✓ Connected to Claude Code. Restart any open Claude Code session.\n  ✓ تم الربط مع Claude Code. أعد فتح أي جلسة Claude Code مفتوحة.\n' : '',
    '  Keep this window open while you work. Ctrl+C to stop.',
    '  اترك هذه النافذة مفتوحة أثناء العمل. للإيقاف: Ctrl+C',
    '');
  openBrowser(url);
}

// Double-click launchers use this: start the stage as a hidden background process, open the browser, exit.
async function background() {
  if (!hooks.isInstalled(port)) hooks.install(port);
  if (!(await alreadyRunning())) {
    const child = spawn(process.execPath, [__filename, 'start', '--no-open', '--port', String(port), '--wait', String(waitSec), ...(planHint ? ['--plan'] : []), ...(saveSessions ? ['--save-sessions'] : [])],
      { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.join(__dirname, '..') });
    child.unref();
    for (let i = 0; i < 50 && !(await alreadyRunning()); i++) await new Promise(r => setTimeout(r, 200));
  }
  openBrowser(url);
}
function stop() {
  let pid = 0; try { pid = Number(fs.readFileSync(P.PID, 'utf8')); } catch (_) {}
  if (!pid) return say('  Agent Theater is not running.');
  try { process.kill(pid); say('  ✓ Agent Theater stopped.'); } catch (_) { say('  Agent Theater is not running.'); }
  try { fs.unlinkSync(P.PID); } catch (_) {}
}

async function main() {
  switch (cmd) {
    case 'start': return flag('background', false) ? background() : start();
    case 'stop': return stop();
    case 'install': hooks.install(port); return say('  ✓ Hooks installed in ' + P.SETTINGS, '  Restart Claude Code, then run: agent-theater');
    case 'uninstall': { const n = hooks.uninstall(); return say(`  ✓ Removed ${n} Agent Theater hooks. Your other settings are untouched.`); }
    case 'demo': return require('../lib/demo').run(port);
    case 'help': default:
      return say('',
        '  agent-theater              start the stage (connects to Claude Code on first run)',
        '  agent-theater stop         stop a stage running in the background',
        '  agent-theater demo         send a scripted session to a running stage',
        '  agent-theater uninstall    remove the hooks from Claude Code',
        '  options: --port 4317  --wait 30  --no-open', '',
        '  --plan            ask Claude for a short task list first (adds a sentence to each prompt, costs a few tokens)', '  --save-sessions   also keep finished shows on disk in ~/.agent-theater/sessions (off by default)', '');
  }
}
main().catch(e => { console.error('  ✗ ' + e.message); process.exit(1); });
