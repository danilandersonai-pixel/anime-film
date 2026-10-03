// Осмотр мира с разных точек: node tools/views.cjs <папка> '<JSON: [{t, pos, target, fov, fstop?}, ...]>'
// (Q — добавка к адресу, например "&film=crystals&half")
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { openPage } = require('./serve.cjs');
(async () => {
  const out = path.resolve(process.argv[2] || 'out/views'); fs.mkdirSync(out, { recursive: true });
  const views = JSON.parse(process.argv[3]);
  const { browser, page, srv, errors } = await openPage('index.html', { width: 1920, height: 1080, query: '?capture' + (process.env.Q || '') });
  await page.waitForFunction(() => window.__ad && window.__ad.ready === true, null, { timeout: 120000 });
  const stage = await page.$('#stage');
  const files = [];
  for (const [i, v] of views.entries()) {
    const t0 = Date.now();
    await page.evaluate((v) => window.__ad.view(v.t ?? 18, v), v);
    const f = path.join(out, `v${String(i).padStart(2, '0')}.png`);
    await stage.screenshot({ path: f, timeout: 180000 });
    files.push(f);
    console.log(`вид ${i}: ${Date.now() - t0} мс`);
  }
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  const cols = files.length > 4 ? 3 : 2, rows = Math.ceil(files.length / cols), args = [];
  files.forEach((f) => args.push('-i', f));
  const sc = files.map((_, i) => `[${i}:v]scale=640:360,drawtext=text='${i}':x=8:y=8:fontsize=22:fontcolor=red[v${i}]`).join(';');
  let ins = files.map((_, i) => `[v${i}]`).join(''), extra = '';
  for (let k = files.length; k < rows * cols; k++) { extra += `;color=c=black:s=640x360:d=1[p${k}]`; ins += `[p${k}]`; }
  const lay = Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', `${sc}${extra};${ins}xstack=inputs=${rows * cols}:layout=${lay}[o]`, '-map', '[o]', '-frames:v', '1', path.join(out, 'sheet.png')]);
  console.log('лист: ' + path.join(out, 'sheet.png'));
})().catch((e) => { console.error(e); process.exit(1); });
