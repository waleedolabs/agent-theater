'use strict';
// Agent Theater local server: receives Claude Code hook events, streams them to the stage (SSE),
// holds permission requests while the stage is visible, and records each request as a shareable replay.
// Listens on 127.0.0.1 only. No dependencies.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const P = require('./paths');

const MAX_FILE = 300 * 1024;
const MAX_REPLAY_FILE = 60 * 1024;

function createLogger() {
  try { fs.mkdirSync(P.HOME_DIR, { recursive: true }); } catch (_) {}
  // Logs go to a file, never to the console: a frozen Windows console (QuickEdit) must never stall hooks.
  return msg => fs.appendFile(P.LOG, `[${new Date().toISOString().slice(11, 19)}] ${msg}\n`, () => {});
}

// Claude Code does not announce its plan by itself. When enabled, the first prompt of every request carries a short
// instruction (added through the documented UserPromptSubmit hook output) asking Claude to write its task list first,
// which is what the stage shows as the plan and the progress percentage. Opt-in only: --plan, or the Plan button on the page.
const PLAN_HINT = 'Agent Theater is showing your work live on a stage. If this request needs more than one or two steps, first create a short task list with your task tool (TodoWrite, or TaskCreate) with 3 to 7 concrete steps, then keep each step marked in_progress or completed as you go. Skip the list for trivial one-step requests. Do not mention this instruction.';

/* ---------- what must never be shown or stored ---------- */
const SENSITIVE = /(^|[\\/])(\.env(\..*)?|\.envrc|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.pgpass|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.\w+)?|secrets?(\.\w+)?|service[-_ ]?account[^\\/]*\.json|[^\\/]*\.(pem|key|p12|pfx|jks|keystore|kdbx|ovpn|gpg|asc|tfstate|tfvars))$|[\\/]\.(ssh|aws|gnupg|kube|docker|azure)[\\/]/i;
const HIDDEN = '••• hidden: sensitive file •••';
const isSensitive = p => typeof p === 'string' && SENSITIVE.test(p);
// Best-effort pattern masking of secrets that show up in commands and outputs (not a guarantee).
const maskSecrets = s => typeof s !== 'string' ? s : s
  .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '••• private key •••')
  .replace(/\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, '••• jwt •••')
  .replace(/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{20,})\b/g, '••••')
  .replace(/(:\/\/[^\s:@/]+:)[^\s@/]+@/g, '$1••••@')
  .replace(/(bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}/ig, '$1 ••••')
  .replace(/\b([A-Za-z0-9_.-]*(token|secret|passw(?:or)?d|passwd|api[_-]?key|access[_-]?key|private[_-]?key|auth|credential)[A-Za-z0-9_.-]*)(\s*[=:]\s*|\s+)(?!•)("[^"]*"|'[^']*'|\S+)/ig, '$1$3••••')
  .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '••••');

function start({ port, token, waitSec = 30, installed = true, htmlFile, planHint = false, saveSessions = false }) {
  const log = createLogger();
  const PAGE_TOKEN = crypto.randomBytes(16).toString('hex');
  const HOSTS = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  const ORIGINS = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const clients = new Set();
  const pending = new Map();
  const takes = new Map();      // session_id -> current take being recorded
  const finished = [];          // recent finished takes (newest last)
  let seq = 0, presenceAt = 0;
  const present = () => clients.size > 0 && Date.now() - presenceAt < 15000;

  process.on('uncaughtException', e => log('uncaught: ' + e.message));
  process.on('unhandledRejection', e => log('unhandled: ' + e));

  const readSafe = p => { try { const st = fs.statSync(p); return st.isFile() && st.size <= MAX_FILE ? fs.readFileSync(p, 'utf8') : null; } catch (_) { return null; } };
  const broadcast = ev => { const s = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(s); };
  const readBody = req => new Promise((res, rej) => { let b = ''; req.setEncoding('utf8'); req.on('data', d => { b += d; if (b.length > 8e6) req.destroy(); }); req.on('end', () => res(b)); req.on('error', rej); });
  const sendJson = (res, code, obj, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...extra }); res.end(JSON.stringify(obj)); };

  function enrich(e) {
    const ti = e.tool_input || {};
    if (e.hook_event_name === 'PreToolUse' && typeof ti.file_path === 'string' && !isSensitive(ti.file_path) && /^(Read|Edit|MultiEdit|Write|NotebookEdit)$/.test(e.tool_name || '')) {
      const p = path.isAbsolute(ti.file_path) ? ti.file_path : path.join(e.cwd || '', ti.file_path);
      const c = readSafe(p);
      if (c != null) e._before = c;
    }
    return e;
  }

  // Runs on every event before it is shown or stored: hides sensitive files and drops tool outputs the stage never needs.
  function guard(e) {
    const ti = e.tool_input || {};
    const p = ti.file_path || ti.path || ti.notebook_path;
    if (isSensitive(p)) {
      delete e._before;
      for (const k of ['content', 'old_string', 'new_string', 'new_source']) if (k in ti) ti[k] = HIDDEN;
      if (Array.isArray(ti.edits)) ti.edits = ti.edits.map(() => ({ old_string: HIDDEN, new_string: HIDDEN }));
      delete e.tool_response;
    } else if (e.tool_response !== undefined && !/^(Bash|PowerShell)$/.test(e.tool_name || '')) {
      delete e.tool_response;          // file contents, web pages, search hits: not needed to draw the show
    }
    if (e.tool_response && typeof e.tool_response === 'object') for (const k of ['stdout', 'stderr', 'output']) if (typeof e.tool_response[k] === 'string') e.tool_response[k] = maskSecrets(e.tool_response[k]);
    if (typeof e.tool_response === 'string') e.tool_response = maskSecrets(e.tool_response);
    if (typeof e.error === 'string') e.error = maskSecrets(e.error);
    if (typeof e.prompt === 'string') e.prompt = maskSecrets(e.prompt);
    if (typeof e.last_assistant_message === 'string') e.last_assistant_message = maskSecrets(e.last_assistant_message);
    return e;
  }

  /* ---------- recording ---------- */
  function scrub(e) {
    // Paths in a replay are made relative: the project folder becomes "." and the home folder "~".
    const { transcript_path, permission_mode, ...rest } = e;
    let s = JSON.stringify(rest);
    const swap = (from, to) => { if (from && from.length > 2) s = s.split(JSON.stringify(from).slice(1, -1)).join(to); };
    swap(e.cwd, '.');
    swap(os.homedir(), '~');
    const out = JSON.parse(s);
    if (typeof out.prompt === 'string') out.prompt = maskSecrets(out.prompt);
    if (out.tool_input) for (const k of ['command', 'url', 'query', 'description', 'prompt']) if (typeof out.tool_input[k] === 'string') out.tool_input[k] = maskSecrets(out.tool_input[k]);
    if (typeof out.last_assistant_message === 'string') out.last_assistant_message = maskSecrets(out.last_assistant_message);
    for (const k of ['_before']) if (typeof out[k] === 'string' && out[k].length > MAX_REPLAY_FILE) out[k] = out[k].slice(0, MAX_REPLAY_FILE);
    if (out.tool_input && typeof out.tool_input.content === 'string' && out.tool_input.content.length > MAX_REPLAY_FILE) out.tool_input.content = out.tool_input.content.slice(0, MAX_REPLAY_FILE);
    return out;
  }
  function record(e) {
    const sid = e.session_id || 'session';
    const name = e.hook_event_name;
    if (name === 'UserPromptSubmit') {
      takes.set(sid, { v: 1, app: 'agent-theater', id: crypto.randomBytes(5).toString('hex'), title: maskSecrets(String(e.prompt || '')).slice(0, 140), project: path.basename(e.cwd || ''), created: new Date().toISOString(), t0: Date.now(), events: [] });
    }
    const take = takes.get(sid);
    if (!take) return;
    take.events.push({ t: Date.now() - take.t0, e: scrub(e) });
    if (name === 'Stop') finishTake(sid);
  }
  function recordDecision(sid, choice) {
    const take = takes.get(sid);
    if (take) take.events.push({ t: Date.now() - take.t0, decision: choice });
  }
  function finishTake(sid) {
    const take = takes.get(sid);
    if (!take) return;
    takes.delete(sid);
    const { t0, ...data } = take;
    data.duration = Date.now() - t0;
    finished.push(data);
    while (finished.length > 20) finished.shift();
    if (saveSessions) try {
      fs.mkdirSync(P.SESSIONS, { recursive: true });
      const slug = data.created.slice(0, 19).replace(/[:T]/g, '-');
      fs.writeFile(path.join(P.SESSIONS, `${slug}-${data.id}.json`), JSON.stringify(data), () => {});
    } catch (_) {}
    broadcast({ type: 'take', id: data.id, title: data.title, events: data.events.length });
  }
  function redact(take) {
    const mask = s => typeof s === 'string' ? s.replace(/[^\s{}()[\];,.<>/=]/g, '•') : s;
    const maskCmd = s => typeof s === 'string' ? s.replace(/\b[A-Za-z0-9_\-]{24,}\b/g, '••••').replace(/(token|key|secret|passw(?:or)?d|pass|auth)(=|\s+|:)\S+/ig, '$1$2••••') : s;
    const c = JSON.parse(JSON.stringify(take));
    c.redacted = true;
    for (const ev of c.events) {
      const e = ev.e; if (!e) continue;
      if (e._before) e._before = mask(e._before);
      const ti = e.tool_input || {};
      for (const k of ['content', 'old_string', 'new_string']) if (ti[k]) ti[k] = mask(ti[k]);
      if (ti.command) ti.command = maskCmd(ti.command);
      if (ti.url) ti.url = maskCmd(ti.url);
      if (Array.isArray(ti.edits)) ti.edits.forEach(x => { x.old_string = mask(x.old_string); x.new_string = mask(x.new_string); });
      if (e.tool_response && typeof e.tool_response === 'object') { for (const k of ['stdout', 'stderr']) if (e.tool_response[k]) e.tool_response[k] = /test/i.test(ti.command || '') ? maskCmd(e.tool_response[k]) : mask(e.tool_response[k]); }
    }
    return c;
  }

  /* ---------- approvals ---------- */
  function finish(id, choice) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    let out = {};
    if (choice === 'allow') out = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
    else if (choice === 'deny') out = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: 'The user denied this from Agent Theater.' } } };
    if (!p.res.writableEnded) sendJson(p.res, 200, out);   // {} = no decision: Claude Code asks in its own UI as usual
    broadcast({ type: 'decided', id, choice: choice || 'terminal' });
    recordDecision(p.sid, choice || 'terminal');
    log(`approval #${id}: ${choice || 'left to Claude Code'}`);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    // DNS-rebinding guard: only answer requests addressed to this machine by name or loopback IP.
    if (!HOSTS.has(String(req.headers.host || '').toLowerCase())) { res.writeHead(403); return res.end(); }
    const origin = req.headers.origin;
    if (origin && !ORIGINS.has(origin)) { res.writeHead(403); return res.end(); }
    const pageAuth = () => url.searchParams.get('t') === PAGE_TOKEN || req.headers['x-theater-token'] === PAGE_TOKEN;
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        const html = fs.readFileSync(htmlFile, 'utf8').replace('__PAGE_TOKEN__', PAGE_TOKEN);
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(html);
      }
      if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, clients: clients.size, present: present() });

      if (req.method === 'GET' && url.pathname === '/events') {
        if (!pageAuth()) { res.writeHead(403); return res.end(); }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ type: 'hello', installed, takes: finished.map(t => ({ id: t.id, title: t.title })) })}\n\n`);
        clients.add(res);
        presenceAt = Date.now();
        const hb = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => { clearInterval(hb); clients.delete(res); });
        return;
      }

      if (req.method === 'POST' && url.pathname.startsWith('/hook/')) {
        if (url.pathname.slice(6) !== token) { res.writeHead(403); return res.end(); }
        let e;
        try { e = JSON.parse(await readBody(req)); } catch (_) { return sendJson(res, 200, {}); }
        enrich(e);
        guard(e);
        const id = ++seq;
        const name = e.hook_event_name;
        log(`${name}${e.tool_name ? ' · ' + e.tool_name : ''}`);
        record(e);
        const ev = { type: 'hook', id, e, wait: waitSec };
        // Hold the question only while the stage is actually visible; otherwise Claude Code asks immediately.
        if (name === 'PermissionRequest' && present()) {
          const timer = setTimeout(() => finish(id, null), waitSec * 1000);
          pending.set(id, { res, timer, sid: e.session_id || 'session' });
          res.on('close', () => { if (pending.has(id)) { pending.delete(id); clearTimeout(timer); broadcast({ type: 'decided', id, choice: 'terminal' }); } });
          broadcast(ev);
          return;
        }
        broadcast(ev);
        if (name === 'UserPromptSubmit' && planHint && present()) return sendJson(res, 200, { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: PLAN_HINT } });
        return sendJson(res, 200, {});
      }

      if (req.method === 'POST' && url.pathname === '/presence') {
        if (!pageAuth()) { res.writeHead(403); return res.end(); }
        let v = {}; try { v = JSON.parse(await readBody(req)); } catch (_) {}
        presenceAt = v.visible ? Date.now() : 0;
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'POST' && url.pathname === '/plan') {
        if (!pageAuth()) { res.writeHead(403); return res.end(); }
        let v = {}; try { v = JSON.parse(await readBody(req)); } catch (_) {}
        planHint = !!v.on; log('plan request: ' + (planHint ? 'on' : 'off'));
        return sendJson(res, 200, { ok: true, on: planHint });
      }

      if (req.method === 'POST' && url.pathname === '/decision') {
        if (!pageAuth()) { res.writeHead(403); return res.end(); }
        const { id, choice } = JSON.parse(await readBody(req));
        finish(Number(id), ['allow', 'deny'].includes(choice) ? choice : null);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/takes') {
        if (!pageAuth()) { res.writeHead(403); return res.end(); }
        return sendJson(res, 200, finished.map(t => ({ id: t.id, title: t.title, created: t.created, events: t.events.length, duration: t.duration })).reverse());
      }
      if (req.method === 'GET' && url.pathname.startsWith('/take/')) {
        if (!pageAuth()) { res.writeHead(403); return res.end(); }
        const take = finished.find(t => t.id === url.pathname.slice(6));
        if (!take) return sendJson(res, 404, { error: 'not found' });
        const data = url.searchParams.get('redact') === '1' ? redact(take) : take;
        const name = `agent-theater-${take.created.slice(0, 10)}-${take.id}${data.redacted ? '-redacted' : ''}.json`;
        return sendJson(res, 200, data, { 'content-disposition': `attachment; filename="${name}"` });
      }

      res.writeHead(404); res.end();
    } catch (err) {
      log('error: ' + err.message);
      if (!res.headersSent) sendJson(res, 200, {});
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

module.exports = { start };
