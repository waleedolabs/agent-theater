'use strict';
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const HOME_DIR = path.join(os.homedir(), '.agent-theater');
module.exports = {
  CLAUDE_DIR,
  SETTINGS: path.join(CLAUDE_DIR, 'settings.json'),
  CONFIG: path.join(HOME_DIR, 'config.json'),
  LEGACY_CONFIG: path.join(CLAUDE_DIR, 'agent-theater.json'),
  LOG: path.join(HOME_DIR, 'theater.log'),
  PID: path.join(HOME_DIR, 'theater.pid'),
  SESSIONS: path.join(HOME_DIR, 'sessions'),
  HOME_DIR,
};
