// Сборка ролика v5: node tools/assemble5.cjs [out.mp4] [--frames out/cycles/frames] [--post out/v5] [--lite]
// Кадры Cycles (1280×720) → апскейл до 1920×1080 → финальная карточка → плёночное зерно,
// мягкая виньетка → появление из чёрного и затухание → звук (уже −14 LUFS).
// --lite — лёгкая копия 1280×720 для отправки в чат.
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

const lite = process.argv.includes('--lite');
const out = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : (lite ? 'out/orbita-pulse-one-v5-lite.mp4' : 'out/orbita-pulse-one-v5.mp4'));
const frames = path.resolve(arg('--frames', 'out/cycles/frames'));
const post = path.resolve(arg('--post', 'out/v5'));
const FPS = 24, DUR = 26, FADE_IN = 0.45, FADE_OUT = [25.35, 0.65];

const n = fs.readdirSync(frames).filter((f) => /^f\d{4}\.png$/.test(f)).length;
if (n < Math.round(DUR * FPS) + 1) console.log(`ВНИМАНИЕ: кадров ${n} из ${Math.round(DUR * FPS) + 1} — ролик выйдет короче`);
const [W, H] = lite ? [1280, 720] : [1920, 1080];
const vf = [
  `[0:v]scale=${W}:${H}:flags=lanczos,unsharp=5:5:${lite ? 0.2 : 0.35}:5:5:0,format=rgba[bg]`,
  `[1:v]scale=${W}:${H}:flags=lanczos,format=rgba[card]`,
  // зерно — только по яркости, меняется каждый кадр; виньетка — едва заметная
  `[bg][card]overlay=0:0:format=auto,format=yuv420p,noise=c0s=${lite ? 5 : 7}:c0f=t+u,vignette=angle=0.36,` +
  `fade=t=in:st=0:d=${FADE_IN},fade=t=out:st=${FADE_OUT[0]}:d=${FADE_OUT[1]}[v]`,
].join(';');
fs.mkdirSync(path.dirname(out), { recursive: true });
const t0 = Date.now();
execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.png'),
  '-framerate', String(FPS), '-i', path.join(post, 'card', 'c%04d.png'),
  '-i', path.join(post, 'audio.wav'),
  '-filter_complex', vf, '-map', '[v]', '-map', '2:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', lite ? '23' : '16', ...(lite ? [] : ['-tune', 'grain']), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', lite ? '160k' : '256k', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log(`готово: ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} МБ, ${((Date.now() - t0) / 1000).toFixed(0)} с)`);
