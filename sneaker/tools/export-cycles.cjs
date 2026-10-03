// Экспорт сцены v5 в Blender: node tools/export-cycles.cjs [папка] [--frames-only]
// → shoe_ember.glb, shoe_glacier.glb, shoe_volt.glb, debris.glb и frames.json
// (--frames-only — только frames.json: геометрия не менялась, поправлено движение)
const fs = require('fs'), path = require('path');
const { openPage } = require('./serve.cjs');
(async () => {
  const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/cycles'); fs.mkdirSync(out, { recursive: true });
  const framesOnly = process.argv.includes('--frames-only');
  const { browser, page, srv, errors } = await openPage('cycles.html', { width: 640, height: 360, query: framesOnly ? '?framesOnly' : '' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  for (const cw of framesOnly ? [] : ['ember', 'glacier', 'volt', 'debris']) {
    const b = await page.evaluate((c) => window.__exp.glb[c], cw);
    fs.writeFileSync(path.join(out, cw === 'debris' ? 'debris.glb' : `shoe_${cw}.glb`), Buffer.from(b, 'base64'));
  }
  const frames = await page.evaluate(() => JSON.stringify({ meta: window.__exp.meta, frames: window.__exp.frames }));
  // сначала во временный файл: рендер может как раз читать frames.json
  fs.writeFileSync(path.join(out, 'frames.json.tmp'), frames);
  fs.renameSync(path.join(out, 'frames.json.tmp'), path.join(out, 'frames.json'));
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  for (const f of fs.readdirSync(out)) console.log(f, (fs.statSync(path.join(out, f)).size / 1e6).toFixed(1), 'МБ');
})().catch((e) => { console.error(e); process.exit(1); });
