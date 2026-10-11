#!/usr/bin/env node
// Builds web/theater.html (served by the local server), docs/index.html (GitHub Pages demo)
// and dist/artifact.html (fragment without document skeleton) from web/src.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'web', 'src', f), 'utf8');
const FONTS = 'https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Chakra+Petch:wght@500;700&family=JetBrains+Mono:wght@400;600&display=swap';
const style = `<style>\n${src('style.css')}</style>`;
const script = `<script>\n${src('i18n.js')}\n${src('app.js')}</script>`;
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${FONTS}">`;
const meta = `<meta name="description" content="Watch Claude Code work as a cinematic, holographic show. شاهد Claude Code وهو يعمل كعرض سينمائي.">`;
const full = `<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Agent Theater · مسرح الوكيل</title>\n${meta}\n${fonts}\n${style}\n</head>\n<body>\n${src('body.html')}\n${script}\n</body>\n</html>\n`;
// The page served from your own computer makes no outside requests at all (system fonts only).
const local = full.replace(fonts + '\n', '');
fs.writeFileSync(path.join(root, 'web', 'theater.html'), local);
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'index.html'), full);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'artifact.html'), `<title>مسرح الوكيل</title>\n${fonts}\n${style}\n${src('body.html')}\n${script}\n`);
console.log('built', (full.length / 1024).toFixed(1) + ' KB');
