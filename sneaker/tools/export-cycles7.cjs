// Экспорт v7 «Кристаллы» в Blender: node tools/export-cycles7.cjs [папка=out/cycles7] [--frames-only]
// → shoe.glb (кроссовок Lunar), cave.glb (плиты, обломки, кристаллы) и frames7.json (покадровое состояние)
const fs = require('fs'), path = require('path');
const { openPage } = require('./serve.cjs');
(async () => {
  const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/cycles7');
  fs.mkdirSync(out, { recursive: true });
  const framesOnly = process.argv.includes('--frames-only');
  const { browser, page, srv, errors } = await openPage('cycles7.html', { width: 640, height: 360, query: framesOnly ? '?framesOnly' : '' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  if (!framesOnly) for (const k of ['shoe', 'cave']) fs.writeFileSync(path.join(out, k + '.glb'), Buffer.from(await page.evaluate((k) => window.__exp.glb[k], k), 'base64'));
  const frames = await page.evaluate(() => JSON.stringify({ meta: window.__exp.meta, frames: window.__exp.frames }));
  fs.writeFileSync(path.join(out, 'frames7.json.tmp'), frames);
  fs.renameSync(path.join(out, 'frames7.json.tmp'), path.join(out, 'frames7.json'));
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  for (const f of fs.readdirSync(out)) if (/\.(glb|json)$/.test(f)) console.log(f, (fs.statSync(path.join(out, f)).size / 1e6).toFixed(1), 'МБ');
})().catch((e) => { console.error(e); process.exit(1); });
