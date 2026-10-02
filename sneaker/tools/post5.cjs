// Пост-продакшн v5: node tools/post5.cjs [папка=out/v5]
// → audio.wav (звук, выровненный до −14 LUFS) и card/c0000.png… (карточка с прозрачным фоном,
//   по кадру на каждый кадр ролика; до появления карточки — пустые кадры)
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const { openPage } = require('./serve.cjs');
const TARGET_LUFS = -14, PEAK_DB = -1.5, FPS = 24;

function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = parseFloat((r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop().match(/-?[\d.]+/)[0]);
  const pk = (r.stderr.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/g) || []).pop();
  return { I, peak: pk ? parseFloat(pk.match(/(-?[\d.]+|-inf)/)[0]) : NaN };
}

(async () => {
  const out = path.resolve(process.argv[2] || 'out/v5');
  const cardDir = path.join(out, 'card');
  fs.mkdirSync(cardDir, { recursive: true });
  const { browser, page, srv, errors } = await openPage('post5.html', { width: 1920, height: 1080 });
  await page.waitForFunction(() => window.__post && window.__post.ready === true, null, { timeout: 120000 });
  const { length, cardIn } = await page.evaluate(() => ({ length: window.__post.length, cardIn: window.__post.cardIn }));

  if (!process.argv.includes('--card-only')) {
    console.log('синтезирую звук…');
    const t0 = Date.now();
    const b64 = await page.evaluate(() => window.__post.wav());
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita5-')), raw = path.join(tmp, 'raw.wav'), wav = path.join(out, 'audio.wav');
    fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
    const m0 = loudness(raw);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `volume=${(TARGET_LUFS - m0.I).toFixed(2)}dB,alimiter=limit=${Math.pow(10, (PEAK_DB - 0.3) / 20).toFixed(4)}:level=disabled`, '-ar', '48000', wav]);
    const m1 = loudness(wav);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`звук: ${((Date.now() - t0) / 1000).toFixed(1)} с, громкость ${m0.I} → ${m1.I} LUFS, пик ${m1.peak} dBFS`);
  }
  if (!process.argv.includes('--audio-only')) {
    const n = Math.round(length * FPS) + 1, first = Math.floor(cardIn * FPS);
    const svg = await page.$('#card');
    await page.evaluate(() => window.__post.card(0));
    const blank = path.join(cardDir, 'blank.png');
    await svg.screenshot({ path: blank, omitBackground: true });
    for (let f = 0; f < n; f++) {
      const file = path.join(cardDir, `c${String(f).padStart(4, '0')}.png`);
      if (f < first) { fs.copyFileSync(blank, file); continue; }
      await page.evaluate((t) => window.__post.card(t), f / FPS);
      await svg.screenshot({ path: file, omitBackground: true });
    }
    fs.rmSync(blank);
    console.log(`карточка: ${n - first} кадров с ${first}-го (${(first / FPS).toFixed(2)} с)`);
  }
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
