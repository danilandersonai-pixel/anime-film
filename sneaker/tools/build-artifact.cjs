// Сборка для публикации артефактом: страница без <html>/<head>/<body>
// (их добавляет площадка) и модули js/*.js рядом.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'out', 'artifact');
fs.mkdirSync(path.join(out, 'js'), { recursive: true });
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/?head>\s*/gi, '').replace(/<\/?body>\s*/gi, '').replace(/<\/html>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of fs.readdirSync(path.join(root, 'js'))) fs.copyFileSync(path.join(root, 'js', f), path.join(out, 'js', f));
console.log(out, fs.readdirSync(path.join(out, 'js')).join(', '));
