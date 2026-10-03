// Экспорт v6 «Анатомия» в Blender: node tools/export-cycles6.cjs [папка=out/cycles6] [--frames-only]
// → shoe_parts.glb (кроссовок, разобранный на детали) и frames6.json (покадровое состояние)
const fs = require('fs'), path = require('path');
const { openPage } = require('./serve.cjs');
(async () => {
  const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'out/cycles6');
  fs.mkdirSync(out, { recursive: true });
  const framesOnly = process.argv.includes('--frames-only');
  const { browser, page, srv, errors } = await openPage('cycles6.html', { width: 640, height: 360, query: framesOnly ? '?framesOnly' : '' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 600000 });
  if (!framesOnly) fs.writeFileSync(path.join(out, 'shoe_parts.glb'), Buffer.from(await page.evaluate(() => window.__exp.glb.parts), 'base64'));
  const frames = await page.evaluate(() => JSON.stringify({ meta: window.__exp.meta, frames: window.__exp.frames }));
  fs.writeFileSync(path.join(out, 'frames6.json.tmp'), frames);
  fs.renameSync(path.join(out, 'frames6.json.tmp'), path.join(out, 'frames6.json'));
  if (errors.length) console.log('ОШИБКИ:\n' + errors.join('\n'));
  await browser.close(); srv.close();
  for (const f of fs.readdirSync(out)) if (/\.(glb|json)$/.test(f)) console.log(f, (fs.statSync(path.join(out, f)).size / 1e6).toFixed(1), 'МБ');
})().catch((e) => { console.error(e); process.exit(1); });
