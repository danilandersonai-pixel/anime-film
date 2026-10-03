// Пост-продакшн v6 «Анатомия»: node tools/post6.cjs [папка=out/v6] [--audio-only | --overlay-only]
// → audio.wav (−14 LUFS) и card/c0000.png… — подписи деталей и карточка с прозрачным фоном,
//   по кадру на каждый кадр Cycles (где ничего нет — пустой кадр)
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const { openPage } = require('./serve.cjs');
const TARGET_LUFS = -14, PEAK_DB = -1.5;
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = parseFloat((r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop().match(/-?[\d.]+/)[0]);
  const pk = (r.stderr.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/g) || []).pop();
  return { I, peak: pk ? parseFloat(pk.match(/(-?[\d.]+|-inf)/)[0]) : NaN };
}
(async () => {
  const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/v6');
  const dir = path.join(out, 'card'); fs.mkdirSync(dir, { recursive: true });
  const { browser, page, srv, errors } = await openPage('post6.html', { width: 1920, height: 1080 });
  await page.waitForFunction(() => window.__post && window.__post.ready === true, null, { timeout: 120000 });
  if (!process.argv.includes('--overlay-only')) {
    const t0 = Date.now();
    const b64 = await page.evaluate(() => window.__post.wav());
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbita6-')), raw = path.join(tmp, 'raw.wav'), wav = path.join(out, 'audio.wav');
    fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
    const m0 = loudness(raw);
    // щелчки деталей очень резкие: ограничитель с быстрой атакой и запасом, иначе пики доходят до 0 дБ
    const lim = `alimiter=limit=${Math.pow(10, (PEAK_DB - 1.5) / 20).toFixed(4)}:attack=0.8:release=60:level=disabled`;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', `volume=${(TARGET_LUFS - m0.I + 0.8).toFixed(2)}dB,${lim},aresample=192000,${lim},aresample=48000`, wav]);
    const m1 = loudness(wav);
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`звук: ${((Date.now() - t0) / 1000).toFixed(1)} с, ${m0.I} → ${m1.I} LUFS, пик ${m1.peak} dBFS`);
  }
  if (!process.argv.includes('--audio-only')) {
    const n = await page.evaluate(() => window.__post.frames), ov = await page.$('#ov');
    await page.evaluate(() => window.__post.overlay(0));
    const blank = path.join(dir, 'blank.png');
    await ov.screenshot({ path: blank, omitBackground: true });
    let k = 0;
    for (let f = 0; f < n; f++) {
      const file = path.join(dir, `c${String(f).padStart(4, '0')}.png`);
      const has = await page.evaluate((i) => window.__post.overlay(i), f);
      if (!has) { fs.copyFileSync(blank, file); continue; }
      await ov.screenshot({ path: file, omitBackground: true }); k++;
    }
    fs.rmSync(blank);
    console.log(`надписи: ${k} кадров с подписями или карточкой из ${n}`);
  }
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
