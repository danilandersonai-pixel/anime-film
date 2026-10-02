// Локальный сервер и невидимый Chromium для проверки кадров и рендера.
// three.js со страницы (cdn.jsdelivr.net) подменяется файлами из node_modules,
// шрифты Google скачиваются один раз в tools/.fontcache.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };

function serve(root = ROOT) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(root, url === '/' ? 'index.html' : url);
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const CACHE = path.join(__dirname, '.fontcache');
function cached(url, ua) {
  fs.mkdirSync(CACHE, { recursive: true });
  const f = path.join(CACHE, crypto.createHash('md5').update(url).digest('hex'));
  if (!fs.existsSync(f)) {
    try { execFileSync('curl', ['-sS', '-f', '-A', ua, '-o', f, url], { stdio: 'pipe' }); } catch (e) { return null; }
  }
  return fs.readFileSync(f);
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function openPage(file = 'index.html', { width = 1920, height = 1080, query = '' } = {}) {
  const { chromium } = require('playwright');
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (process.env.LOG) console.log('  [page]', m.text()); });
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, (r) => {
    const rel = r.request().url().match(/three@[^/]+\/(.*)$/)[1];
    const f = path.join(ROOT, 'node_modules', 'three', rel);
    if (fs.existsSync(f)) r.fulfill({ body: fs.readFileSync(f), contentType: 'text/javascript' }); else r.abort();
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => {
    const url = r.request().url(), body = cached(url, UA);
    if (!body) { r.abort(); return; }
    r.fulfill({ body, contentType: url.includes('googleapis') ? 'text/css' : 'font/woff2' });
  });
  await page.goto(`http://127.0.0.1:${port}/${file}${query}`);
  return { browser, page, srv, errors };
}

module.exports = { serve, openPage, ROOT };
