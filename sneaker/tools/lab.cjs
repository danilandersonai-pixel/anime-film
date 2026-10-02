// Лист проверки модели: node tools/lab.cjs <папка> [расцветка]
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { openPage } = require('./serve.cjs');
(async () => {
  const out = path.resolve(process.argv[2] || 'out/lab'); fs.mkdirSync(out, { recursive: true });
  const { browser, page, srv, errors } = await openPage('lab.html', { width: 960, height: 540 });
  await page.waitForFunction(() => window.labReady === true, null, { timeout: 60000 });
  const files = [];
  for (let i = 0; i < 8; i++) {
    const t0 = Date.now();
    const d = await page.evaluate(([i, cw]) => window.labRender(i, cw), [i, process.argv[3] || null]);
    const f = path.join(out, `v${i}.png`); fs.writeFileSync(f, Buffer.from(d.split(',')[1], 'base64')); files.push(f);
    console.log(`вид ${i}: ${Date.now() - t0} мс`);
  }
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  const args = []; files.forEach((f) => args.push('-i', f));
  const lay = files.map((_, i) => `${(i % 2) * 960}_${Math.floor(i / 2) * 540}`).join('|');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', `xstack=inputs=${files.length}:layout=${lay}[o]`, '-map', '[o]', '-frames:v', '1', path.join(out, 'sheet.png')]);
  console.log('лист: ' + path.join(out, 'sheet.png'));
})().catch((e) => { console.error(e); process.exit(1); });
