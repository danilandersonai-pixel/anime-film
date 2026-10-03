#!/usr/bin/env bash
# pipeline.sh — ночной конвейер: досчитать «Улицу» (v5) → собрать её MP4 →
# отрендерить «Кристаллы» (v7) → собрать MP4 → отрендерить «Анатомию» (v6) → собрать MP4.
# Упавший рендер перезапускается; после перезапуска контейнера конвейер можно просто
# запустить снова — он продолжит с того места, где остановился.
set -u
cd "$(dirname "$0")/.."
LOG=${LOG:-out/pipeline.log}
say() { echo "$(date +%H:%M) $*" >> "$LOG"; }
count() { ls "$1" 2>/dev/null | grep -c '^f[0-9]*\.png$'; }
export NODE_PATH=${NODE_PATH:-$(npm root -g)}
# рендер: пока кадров меньше нужного — держать запущенным скрипт с перезапусками
render() { # $1 — папка кадров, $2 — сколько кадров, $3 — скрипт *-all.sh, $4 — процесс python, $5 — имя
  while [ "$(count "$1")" -lt "$2" ]; do
    pgrep -f "$3" >/dev/null || { say "$5: запуск рендера с $(count "$1") кадров"; (setsid nohup bash "cycles/$3" >> "out/$5.log" 2>&1 < /dev/null &); }
    sleep 60
  done
  while pgrep -f "$4" >/dev/null; do sleep 10; done
}

say "старт конвейера (v5 → v7 → v6)"
render out/cycles/frames 625 render-all.sh "cycles/render.py" render5
if [ ! -s out/orbita-pulse-one-v5.mp4 ]; then
  say "v5: сборка MP4"
  node tools/assemble5.cjs >> "$LOG" 2>&1 && node tools/assemble5.cjs --lite >> "$LOG" 2>&1
fi
render out/cycles7/frames 481 render7-all.sh "cycles/render7.py" render7
if [ ! -s out/orbita-pulse-one-v7.mp4 ] && [ -s out/v7/audio.wav ] && [ -d out/v7/card ]; then
  say "v7: сборка MP4"
  A7="--frames out/cycles7/frames --post out/v7 --dur 20 --fade-in 0.8 --fade-out 19.4:0.6 --letterbox --name orbita-pulse-one-v7"
  node tools/assemble5.cjs $A7 >> "$LOG" 2>&1 && node tools/assemble5.cjs $A7 --lite >> "$LOG" 2>&1
fi
render out/cycles6/frames 721 render6-all.sh "cycles/render6.py" render6
if [ ! -s out/orbita-pulse-one-v6.mp4 ]; then
  say "v6: сборка MP4"
  A6="--frames out/cycles6/frames --post out/v6 --dur 30 --fade-in 0.4 --fade-out 29.35:0.65 --name orbita-pulse-one-v6"
  node tools/assemble5.cjs $A6 >> "$LOG" 2>&1 && node tools/assemble5.cjs $A6 --lite >> "$LOG" 2>&1
fi
say "конвейер завершён"
