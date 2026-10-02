// Покадровая проверка: снимает ключевые кадры и собирает лист кадров.
// Запуск: NODE_PATH=$(npm root -g) node tools/frames.cjs <папка> [время,время,...] [тема]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { openFilm } = require('./serve.cjs');

(async () => {
  const out = path.resolve(process.argv[2] || 'frames');
  const times = (process.argv[3] || '0,2.5,5.6,7.9,11,14.9,16.6,19,20.3,22.5,24.1,25.4,28.4,32,37.8,40.5,42,47,52,57.9').split(',').map(Number);
  const theme = process.argv[4] || '';
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, srv, errors } = await openFilm(theme);
  const files = [];
  for (const [i, t] of times.entries()) {
    const t0 = Date.now();
    const data = await page.evaluate((x) => { window.__film.render(x); return document.getElementById('film').toDataURL('image/png'); }, t);
    const f = path.join(out, `f${String(i).padStart(2, '0')}_${t.toFixed(2)}.png`);
    fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
    files.push(f);
    console.log(`t=${t.toFixed(2)}  ${Date.now() - t0} мс  ${path.basename(f)}`);
  }
  if (errors.length) console.log('ОШИБКИ НА СТРАНИЦЕ:\n' + errors.join('\n'));
  await browser.close();
  srv.close();
  // лист кадров 4 в ряд
  const cols = 4, rows = Math.ceil(files.length / cols);
  const args = [];
  files.forEach((f) => args.push('-i', f));
  const scaled = files.map((_, i) => `[${i}:v]scale=480:270,drawtext=text='${times[i].toFixed(2)}':x=8:y=8:fontsize=22:fontcolor=red[v${i}]`).join(';');
  const pad = rows * cols - files.length;
  let inputs = files.map((_, i) => `[v${i}]`).join('');
  let extra = '';
  for (let k = 0; k < pad; k++) { extra += `;color=c=black:s=480x270:d=1[p${k}]`; inputs += `[p${k}]`; }
  const filter = `${scaled}${extra};${inputs}xstack=inputs=${rows * cols}:layout=${Array.from({ length: rows * cols }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join('|')}[out]`;
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', path.join(out, 'sheet.png')]);
    console.log('лист кадров: ' + path.join(out, 'sheet.png'));
  } catch (e) { console.log('не удалось собрать лист кадров: ' + e.message); }
})().catch((e) => { console.error(e); process.exit(1); });
