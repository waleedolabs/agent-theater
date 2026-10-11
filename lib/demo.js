'use strict';
// Scripted demo: sends events that look like a real Claude Code session to a running stage.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadConfig } = require('./hooks');
let hookUrl = '';
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'theater-demo-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const routesPath = path.join(proj, 'routes.js');
fs.writeFileSync(path.join(proj, 'package.json'), '{\n  "name": "my-shop",\n  "type": "module",\n  "dependencies": {\n    "express": "^4.19.2"\n  }\n}\n');
fs.writeFileSync(routesPath, "import express from 'express';\nconst router = express.Router();\n\nrouter.get('/', home);\nrouter.get('/login', oldLoginPage);\nrouter.post('/signup', signup);\n\nexport default router;\n");

const common = { session_id: 'demo', transcript_path: '', cwd: proj, permission_mode: 'default' };
let n = 0;
async function hook(ev) {
  const body = { ...common, ...ev };
  const r = await fetch(hookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
const tool = async (name, input, response, gap = 2500) => {
  const id = 'toolu_demo_' + (++n);
  await hook({ hook_event_name: 'PreToolUse', tool_name: name, tool_input: input, tool_use_id: id });
  await sleep(gap);
  await hook({ hook_event_name: 'PostToolUse', tool_name: name, tool_input: input, tool_response: response, tool_use_id: id });
};

const AUTH = "import { compare } from 'bcrypt';\n\nexport async function login(email, password) {\n  if (!email.includes('@')) {\n    throw new Error('invalid email');\n  }\n  const user = await db.users.find({ email });\n  if (!user) return { ok: false };\n  const valid = await compare(password, user.hash);\n  return { ok: valid, token: valid ? sign(user.id) : null };\n}\n";

async function run(port) {
  const URL_ = `http://127.0.0.1:${port}/hook/${loadConfig().token}`;
  hookUrl = URL_;
  try { await fetch(`http://127.0.0.1:${port}/health`); } catch (_) { console.error('  The stage is not running. Start it first: npx agent-theater'); process.exit(1); }
  console.log('  Demo started… answer the approval on the stage.');
  await hook({ hook_event_name: 'SessionStart', source: 'startup' }); await sleep(1500);
  await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'سوّيلي صفحة تسجيل دخول للموقع' }); await sleep(2500);
  await tool('TodoWrite', { todos: [
    { content: 'فهم المشروع', status: 'in_progress' }, { content: 'واجهة الدخول', status: 'pending' },
    { content: 'منطق الدخول', status: 'pending' }, { content: 'ربط المسارات', status: 'pending' }, { content: 'الاختبارات', status: 'pending' }] }, {}, 1500);
  await tool('Read', { file_path: path.join(proj, 'package.json') }, {}, 3000);
  await tool('Read', { file_path: routesPath }, {}, 3500);
  await tool('TodoWrite', { todos: [
    { content: 'فهم المشروع', status: 'completed' }, { content: 'واجهة الدخول', status: 'in_progress' },
    { content: 'منطق الدخول', status: 'pending' }, { content: 'ربط المسارات', status: 'pending' }, { content: 'الاختبارات', status: 'pending' }] }, {}, 1000);
  await tool('Write', { file_path: path.join(proj, 'login.html'), content: '<form id="login" class="auth-card">\n  <h1>Sign in</h1>\n  <input type="email" name="email" required>\n  <input type="password" name="password" required>\n  <button type="submit">Login</button>\n</form>\n<script type="module" src="auth.js"></script>' }, { type: 'create' }, 9000);

  console.log('  Waiting for your approval on the stage…');
  const decision = await hook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm install bcrypt', description: 'تثبيت مكتبة التشفير' } });
  
  const allowed = decision?.hookSpecificOutput?.decision?.behavior === 'allow';
  if (allowed) await tool('Bash', { command: 'npm install bcrypt', description: 'تثبيت مكتبة التشفير' }, { stdout: 'added 3 packages in 2.1s', stderr: '', interrupted: false }, 3000);

  await tool('TodoWrite', { todos: [
    { content: 'فهم المشروع', status: 'completed' }, { content: 'واجهة الدخول', status: 'completed' },
    { content: 'منطق الدخول', status: 'in_progress' }, { content: 'ربط المسارات', status: 'pending' }, { content: 'الاختبارات', status: 'pending' }] }, {}, 1000);
  await tool('Write', { file_path: path.join(proj, 'auth.js'), content: AUTH }, { type: 'create' }, 14000);
  fs.writeFileSync(path.join(proj, 'auth.js'), AUTH);

  await tool('TodoWrite', { todos: [
    { content: 'فهم المشروع', status: 'completed' }, { content: 'واجهة الدخول', status: 'completed' },
    { content: 'منطق الدخول', status: 'completed' }, { content: 'ربط المسارات', status: 'in_progress' }, { content: 'الاختبارات', status: 'pending' }] }, {}, 1000);
  await tool('Edit', { file_path: routesPath, old_string: "router.get('/login', oldLoginPage);", new_string: "router.get('/login', serve('login.html'));\nrouter.post('/api/login', handleLogin);" }, {}, 9000);

  await tool('TodoWrite', { todos: [
    { content: 'فهم المشروع', status: 'completed' }, { content: 'واجهة الدخول', status: 'completed' },
    { content: 'منطق الدخول', status: 'completed' }, { content: 'ربط المسارات', status: 'completed' }, { content: 'الاختبارات', status: 'in_progress' }] }, {}, 1000);
  await tool('Bash', { command: 'npm test', description: 'تشغيل الاختبارات' }, { stdout: 'PASS  login form renders\nPASS  rejects email without @\nFAIL  accepts uppercase email\n\nTests: 1 failed, 4 passed, 5 total', stderr: '', interrupted: false }, 4000);
  await sleep(2500);
  await tool('Edit', { file_path: path.join(proj, 'auth.js'), old_string: "export async function login(email, password) {", new_string: "export async function login(email, password) {\n  email = email.trim().toLowerCase();" }, {}, 6000);
  await tool('Bash', { command: 'npm test', description: 'إعادة الاختبارات' }, { stdout: 'PASS  login form renders\nPASS  rejects email without @\nPASS  accepts uppercase email\nPASS  rejects wrong password\nPASS  returns token\n\nTests: 5 passed, 5 total', stderr: '', interrupted: false }, 4000);
  await tool('TodoWrite', { todos: [
    { content: 'فهم المشروع', status: 'completed' }, { content: 'واجهة الدخول', status: 'completed' },
    { content: 'منطق الدخول', status: 'completed' }, { content: 'ربط المسارات', status: 'completed' }, { content: 'الاختبارات', status: 'completed' }] }, {}, 1000);
  await hook({ hook_event_name: 'Stop', last_assistant_message: 'خلصت. صفحة تسجيل الدخول جاهزة، والتحقق من البريد صار يتجاهل الأحرف الكبيرة، وكل الاختبارات الخمسة نجحت.' });
  console.log('  Demo finished ✓');
  fs.rmSync(proj, { recursive: true, force: true });
}
module.exports = { run };
