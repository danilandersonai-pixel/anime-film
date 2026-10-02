// Собирает один самодостаточный HTML-файл (все скрипты внутри).
// Шрифт берётся из Google Fonts, локальная копия не встраивается.
// Запуск: node tools/build-single.cjs [out.html] [--fragment]
//   --fragment — без <!doctype>/<html>/<head>/<body> (для публикации артефактом)
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'out', 'mishka.html'));
const fragment = process.argv.includes('--fragment');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/\/\* local-fonts:start[\s\S]*?local-fonts:end \*\/\n?/, '');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  if (js.includes('</script')) throw new Error('в ' + src + ' встречается </script');
  return `<script>\n/* ${src} */\n${js}</script>`;
});

if (fragment) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const links = (html.match(/<link [^>]+>/g) || []).join('\n');
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = `${title}\n${links}\n${style}\n${body.trim()}\n`;
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} КБ`);
