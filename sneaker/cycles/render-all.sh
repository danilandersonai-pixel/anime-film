#!/usr/bin/env bash
# render-all.sh — полный рендер монтажа v5 в Cycles с перезапуском после сбоя.
# Уже готовые кадры render.py пропускает, поэтому скрипт можно запускать повторно.
# Диапазоны идут по очереди: план drip (кадры 360–407) — последним, его данные
# можно поправить, пока рендерится остальное.
#   bash cycles/render-all.sh            # 1280×720, 12 сэмплов
#   RES=1920x1080 SPP=24 bash cycles/render-all.sh
set -u
cd "$(dirname "$0")/.."
RES=${RES:-1280x720}
SPP=${SPP:-12}
OUT=${OUT:-out/cycles/frames}
RANGES=${RANGES:-"0:360 408:625 360:408"}
for r in $RANGES; do
  for try in 1 2 3 4 5; do
    python3 cycles/render.py --data out/cycles --out "$OUT" --res "$RES" --spp "$SPP" \
      --hdr out/cycles/city.hdr --frames "$r" && break
    echo "!! сбой на диапазоне $r (попытка $try), перезапуск" >&2
    sleep 5
  done
done
n=$(ls "$OUT"/f*.png 2>/dev/null | wc -l)
echo "ГОТОВО: $n кадров в $OUT"
