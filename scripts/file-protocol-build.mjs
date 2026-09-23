import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const htmlPath = join(dist, 'index.html');
let html = readFileSync(htmlPath, 'utf8');

const assetsDir = join(dist, 'assets');
if (!existsSync(assetsDir)) throw new Error('dist/assets missing — run vite build first');
const assets = readdirSync(assetsDir);
const jsName = assets.find((f) => f.endsWith('.js'));
const cssName = assets.find((f) => f.endsWith('.css'));
if (!jsName || !cssName) throw new Error(`missing assets (js=${jsName}, css=${cssName})`);

html = html
  .replace(/\s*<script[^>]*src="[^"]+"[^>]*><\/script>/g, '')
  .replace(/\s*<link[^>]*rel="stylesheet"[^>]*>/g, '');
html = html.replace(
  '</head>',
  `    <link rel="stylesheet" href="./assets/${cssName}">\n    <script defer src="./assets/${jsName}"></script>\n  </head>`
);
writeFileSync(htmlPath, html);

if (!existsSync(join(dist, 'fixtures', 'job-minimal.zip'))) {
  throw new Error('dist/fixtures/job-minimal.zip missing — ensure public/fixtures is populated');
}

console.log(`Wrote dist/index.html (classic defer scripts: assets/${jsName}, assets/${cssName})`);
