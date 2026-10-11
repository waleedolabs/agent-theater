#!/bin/bash
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
node bin/cli.js stop
osascript -e 'tell application "Terminal" to close (every window whose name contains "Stop Agent Theater.command")' >/dev/null 2>&1 &
exit 0
