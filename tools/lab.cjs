// Снимает «лабораторию персонажей» с разных ракурсов: node tools/lab.cjs <папка>
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { serve } = require('./serve.cjs');
(async () => {
  const out = path.resolve(process.argv[2] || 'lab');
  fs.mkdirSync(out, { recursive: true });
  const { chromium } = require('playwright');
  const srv = await serve(path.resolve(__dirname, '..'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${srv.address().port}/tools/lab.html`);
  await page.waitForFunction(() => window.labReady === true);
  const files = [];
  for (let v = 0; v < 6; v++) {
    const t0 = Date.now();
    const data = await page.evaluate((vi) => { window.labRender(vi); return document.getElementById('c').toDataURL('image/png'); }, v);
    const f = path.join(out, `v${v}.png`);
    fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
    files.push(f);
    console.log(`вид ${v}: ${Date.now() - t0} мс`);
  }
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  const args = []; files.forEach((f) => args.push('-i', f));
  const filter = files.map((_, i) => `[${i}:v]scale=960:540[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=6:layout=0_0|960_0|0_540|960_540|0_1080|960_1080[o]`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', filter, '-map', '[o]', '-frames:v', '1', path.join(out, 'sheet.png')]);
  console.log('лист: ' + path.join(out, 'sheet.png'));
})().catch((e) => { console.error(e); process.exit(1); });
