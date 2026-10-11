<div align="center">

# 🎬 Agent Theater

**Stop staring at a scrolling terminal. Watch your AI agent work.**

Agent Theater turns a Claude Code session into a live, cinematic show: the agent plans, reads your project, types code line by line, runs tests, and freezes the whole stage when it needs your approval. You answer from the stage, and the answer goes straight back to Claude Code.

[**▶ Try the live demo**](https://waleedolabs.github.io/agent-theater/) · [العربية](README.ar.md)

<img src="media/demo.webp" alt="Agent Theater: a holographic stage showing an AI agent planning, writing code, asking for approval and running tests" width="760">

</div>

[Watch it as a video](media/demo.mp4)

## Run it

```bash
npx github:waleedolabs/agent-theater
```

That's the whole setup (or, without a terminal: download the repo and double-click **`Agent Theater.vbs`** on Windows or **`Agent Theater.command`** on macOS. It runs in the background with no window and opens the stage; use the matching `Stop Agent Theater` file to stop it. On macOS the first time, right-click → Open to get past the unsigned-file warning). On the first run it connects itself to Claude Code (it adds a few local hooks to `~/.claude/settings.json` and keeps a backup), starts a small local server and opens the stage in your browser. Restart any open Claude Code session, then work as usual.

Requires Node.js 18+ and Claude Code (the terminal, or a **Local** session in the Claude desktop app's Code tab).

## Step by step

**Windows**
1. Install [Node.js](https://nodejs.org) 18 or newer (the LTS installer is fine) and Claude Code.
2. Open PowerShell and run `npx github:waleedolabs/agent-theater`. Or download the repo as a ZIP, unzip it and double-click **`Agent Theater.vbs`** (no window appears; the stage opens in your browser).
3. Close and reopen Claude Code, then give it a task. Watch the stage.
4. To stop: double-click **`Stop Agent Theater.vbs`**, or run `npx github:waleedolabs/agent-theater stop`.

**macOS / Linux**
1. Install Node.js 18+ (`brew install node`) and Claude Code.
2. In Terminal run `npx github:waleedolabs/agent-theater`. Or download the repo, then double-click **`Agent Theater.command`** (first time: right-click → Open).
3. Restart Claude Code and give it a task.
4. To stop: **`Stop Agent Theater.command`**, or `npx github:waleedolabs/agent-theater stop`.

**To remove everything:** `npx github:waleedolabs/agent-theater uninstall` removes only its own hooks from `~/.claude/settings.json`.

## What you see

| Moment | On stage |
|---|---|
| You send a request | A title card, then a planning panel that stays alive while the agent thinks |
| The agent makes a plan | Its to-do list becomes a constellation that lights up step by step |
| Reading files | The file opens as a hologram and a scan beam pulls its contents into the AI core |
| Writing code | Lines are typed live, with an energy beam from the core to the cursor |
| Editing | Old lines turn red and shatter into falling characters, new ones are typed in |
| Running tests | Results land one by one, with a score meter. A failure glitches the whole stage red |
| Asking permission | Everything dims, an alarm sounds, and you **Allow / Deny** right there |
| Done | Panels gather into a mosaic, numbers roll up, fireworks |

Plus an ambient soundtrack with sound effects, subtitles in Arabic or English, and an automatic quality governor so it stays smooth on modest machines.

## Share your sessions

**About the plan and progress bar:** Claude Code does not announce its plan by itself, so the stage normally just shows each step as it happens. If you press **Ask Claude for a plan** (or start with `--plan`), the stage asks Claude, through a hook, to write a short task list first. That list then appears as the plan, with a percentage. It is off by default because it adds a sentence to every prompt and costs a few tokens.

Every request you run is recorded. Press **Save show** to download it as a small file (with an option to hide file contents), and anyone can replay it in the [live demo](https://waleedolabs.github.io/agent-theater/) with **Open replay**, or by dropping the file on the page. Recordings are kept in memory only; they are written to `~/.agent-theater/sessions` only if you start with `--save-sessions`.

Want a video instead? Press **Record video** once, pick this tab, and the stage records itself (with its sound) from the next request until a moment after the finale, then downloads an `.mp4` or `.webm`. Esc cancels. It's optional and works in Chrome and Edge when the stage runs from your computer or from GitHub Pages.

To share by link, upload the file anywhere that serves raw JSON with CORS (a GitHub Gist works) and send:
`https://waleedolabs.github.io/agent-theater/?r=<raw file URL>`

## Approvals

When Claude Code asks for permission and the stage is visible, the question appears on stage:

- **Allow / Deny** is sent back to Claude Code.
- **Decide in Claude Code** hands the question back to Claude Code's normal prompt.
- If the stage is closed or in a background tab, Claude Code asks immediately as usual. If you don't answer within 30 seconds, the question goes back too (`--wait 60` to change it).

## Commands

```bash
npx github:waleedolabs/agent-theater              # start the stage
npx github:waleedolabs/agent-theater demo         # send a scripted session to a running stage
npx github:waleedolabs/agent-theater uninstall    # remove the hooks; the rest of your settings stay untouched
# options: --port 4317  --wait 30  --no-open
```

## Privacy and security

Agent Theater sees what Claude Code does, so here is exactly what it touches. No software can promise "100% safe"; this is what it does, what it deliberately does not do, and where the limits are.

**Where your data goes**
- Everything stays on your computer. The server listens on `127.0.0.1` only, and the page it serves loads nothing from the internet (no fonts, no scripts, no analytics, no telemetry). The public demo page (GitHub Pages) uses Google Fonts and contains only fake demo data.
- Finished shows are kept **in memory only** (the last 20) and disappear when you stop the stage. Nothing is written to disk unless you start it with `--save-sessions`. The log file records event names only (for example "PreToolUse · Read"), never contents.
- Nothing is uploaded anywhere. Sharing is something you do yourself with a file you download.

**What is hidden before anything is shown or stored**
- Contents of sensitive files are never read or shown: `.env*`, `.npmrc`, `.netrc`, `.git-credentials`, `*.pem`, `*.key`, `*.p12`, `id_rsa*`, `credentials*`, `secrets*`, `*.tfstate`, `*.tfvars`, service-account JSON, and anything inside `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`, `.azure`. The stage shows "hidden: sensitive file" instead.
- Tool outputs the show does not need (file contents Claude read, web pages, search results) are dropped. Only command output (for tests and errors) is kept.
- Secrets in commands, outputs and your prompt are masked on a best-effort basis: private keys, JWTs, API tokens (`sk-…`, `ghp_…`, `AKIA…`, `xox…`, `npm_…`), `user:password@` in URLs, `Bearer …`, `password=…`, `token=…`, and long random-looking strings.
- Paths in saved shows are made relative (your project folder becomes `.`, your home folder `~`).

**Limits you should know about**
- Masking is pattern-based. A secret that does not look like a secret (a short password in plain prose, a custom format) can slip through. **Read a show before you share it.** "Hide file contents" is ticked by default when you save, and it blanks the contents of every file shown.
- Normal files that Claude reads or writes (your source code) are shown on the stage and kept in the in-memory show. If your code is private, treat a shared show or a screen recording as private too.
- The video recorder records your screen tab, so it records whatever is on it.
- Claude Code decides what it does. Agent Theater only watches. It cannot see more than the hook events Claude Code sends (it never reads your transcript).

**Access control**
- Hooks are authenticated with a random token, and the stage page with a different one. Approvals (Allow/Deny) require that page token.
- Requests with a foreign `Origin` or `Host` header are rejected (protects against web pages that try to talk to your local server, including DNS rebinding).
- If Agent Theater is not running, Claude Code behaves exactly as before.

**Changes to your Claude Code setup**
- Setup adds a few `http` hooks to `~/.claude/settings.json` (after saving a backup). `agent-theater uninstall` removes exactly those hooks and nothing else.
- The task-list request is **off by default**. If you turn it on (the "Ask Claude for a plan" button or `--plan`), a short sentence is added to each prompt while the stage is open, and it uses a few extra tokens.
- The "thinking" scene is a visual, not Claude's real reasoning. Claude Code does not expose its reasoning to hooks.

## How it works

Claude Code [hooks](https://code.claude.com/docs/en/hooks) post every event (prompt, tool use, permission request, stop) to a zero-dependency Node server. The server streams them to the page over Server-Sent Events and holds permission requests until you decide. The page is a single HTML file: DOM for the 3D panels, one canvas for the core and particles, Web Audio for sound and effects.

## License

MIT
