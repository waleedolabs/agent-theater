#!/bin/bash
# Agent Theater for macOS: double-click to start. The stage runs in the background and opens in your browser.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Agent Theater needs Node.js (free). Open nodejs.org to install it?" buttons {"Cancel","Open nodejs.org"} default button 2 with title "Agent Theater"' >/dev/null 2>&1 && open "https://nodejs.org"
  exit 1
fi
node bin/cli.js start --background >/dev/null 2>&1
# close this Terminal window so nothing stays on screen
osascript -e 'tell application "Terminal" to close (every window whose name contains "Agent Theater.command")' >/dev/null 2>&1 &
exit 0
