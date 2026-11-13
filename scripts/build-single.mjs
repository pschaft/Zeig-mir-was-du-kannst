// Baut Unikram als einzelne HTML-Datei (CSS + gebündeltes JS inline):
//   dist/unikram.html  – eigenständig: per Doppelklick öffnen, läuft komplett offline
//   dist/artifact.html – Seiteninhalt für eingebettete Ansichten (ohne <html>/<head>-Gerüst)
// Aufruf: npm run build
import { build, transform } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8');

const css = (await transform(read('css/app.css'), { loader: 'css', minify: true })).code;

const result = await build({
  entryPoints: [root + 'js/app.js'],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2020', 'safari15', 'chrome100', 'firefox100'],
  legalComments: 'none',
  charset: 'utf8',
});
// Inline-Skript absichern: "</script" und "<!--" dürfen im Skripttext nicht vorkommen
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const description = 'Dein ganzer Unikram in einer App: Stundenplan, Aufgaben, Fokus-Timer, Karteikarten, Noten, Budget, WG-Kasse, Lernplan und mehr.';
const themeBoot = `try{var s=JSON.parse(localStorage.getItem('unikram:v1')||'{}').settings||{};var r=document.documentElement,h=r.getAttribute('data-theme');var d=s.theme==='dark'||((!s.theme||s.theme==='system')&&(h?h==='dark':matchMedia('(prefers-color-scheme: dark)').matches));if(d)r.classList.add('dark');if(s.accent)r.style.setProperty('--accent',s.accent)}catch(e){}`;
const appMarkup = `<div id="app" class="app"><aside id="sidebar" class="sidebar" aria-label="Navigation"></aside><main id="view" class="view" tabindex="-1"></main><nav id="tabbar" class="tabbar" aria-label="Hauptnavigation"></nav></div><div id="toasts" class="toasts" aria-live="polite"></div>`;
const favicon = 'data:image/svg+xml;base64,' + Buffer.from(read('icons/icon.svg')).toString('base64');

mkdirSync(root + 'dist', { recursive: true });

const standalone = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Unikram</title>
<meta name="description" content="${description}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="${favicon}">
<style>${css}</style>
<script>${themeBoot}</script>
</head>
<body>
${appMarkup}
<script>${js}</script>
</body>
</html>
`;
writeFileSync(root + 'dist/unikram.html', standalone);

const artifact = `<title>Unikram</title>
<meta name="description" content="${description}">
<style>${css}</style>
<script>window.UNIKRAM_EMBED=true;document.documentElement.classList.add('embed');document.documentElement.lang='de';${themeBoot}</script>
${appMarkup}
<script>${js}</script>
`;
writeFileSync(root + 'dist/artifact.html', artifact);

const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)} KB`;
console.log(`dist/unikram.html  ${kb(standalone)}`);
console.log(`dist/artifact.html ${kb(artifact)}  (JS ${kb(js)}, CSS ${kb(css)})`);
