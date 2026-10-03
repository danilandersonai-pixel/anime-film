#!/usr/bin/env bash
# pipeline.sh — ночной конвейер: досчитать «Улицу» (v5) → собрать её MP4 →
# отрендерить «Анатомию» (v6) → собрать её MP4. Упавший рендер перезапускается;
# после перезапуска контейнера конвейер можно просто запустить снова — он продолжит.
set -u
cd "$(dirname "$0")/.."
LOG=${LOG:-out/pipeline.log}
say() { echo "$(date +%H:%M) $*" >> "$LOG"; }
count() { ls "$1" 2>/dev/null | grep -c '^f[0-9]*\.png$'; }
export NODE_PATH=${NODE_PATH:-$(npm root -g)}

say "старт конвейера"
while [ "$(count out/cycles/frames)" -lt 625 ]; do
  pgrep -f "render-all.sh" >/dev/null || { say "v5: запуск рендера с $(count out/cycles/frames) кадров"; (setsid nohup bash cycles/render-all.sh >> out/render5.log 2>&1 < /dev/null &); }
  sleep 60
done
while pgrep -f "cycles/render.py" >/dev/null; do sleep 10; done
if [ ! -s out/orbita-pulse-one-v5.mp4 ]; then
  say "v5: сборка MP4"
  node tools/assemble5.cjs >> "$LOG" 2>&1 && node tools/assemble5.cjs --lite >> "$LOG" 2>&1
fi
while [ "$(count out/cycles6/frames)" -lt 721 ]; do
  pgrep -f "render6-all.sh" >/dev/null || { say "v6: запуск рендера с $(count out/cycles6/frames) кадров"; (setsid nohup bash cycles/render6-all.sh >> out/render6.log 2>&1 < /dev/null &); }
  sleep 60
done
while pgrep -f "cycles/render6.py" >/dev/null; do sleep 10; done
if [ ! -s out/orbita-pulse-one-v6.mp4 ]; then
  say "v6: сборка MP4"
  A6="--frames out/cycles6/frames --post out/v6 --dur 30 --fade-in 0.4 --fade-out 29.35:0.65 --name orbita-pulse-one-v6"
  node tools/assemble5.cjs $A6 >> "$LOG" 2>&1 && node tools/assemble5.cjs $A6 --lite >> "$LOG" 2>&1
fi
say "конвейер завершён"
