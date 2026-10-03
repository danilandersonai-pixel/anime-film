#!/usr/bin/env bash
# render6-all.sh — полный рендер v6 «Анатомия» в Cycles с перезапуском после сбоя.
# Готовые кадры render6.py пропускает, поэтому скрипт можно запускать повторно.
#   bash cycles/render6-all.sh            # 1280×720, 16 сэмплов
set -u
cd "$(dirname "$0")/.."
RES=${RES:-1280x720}
SPP=${SPP:-16}
OUT=${OUT:-out/cycles6/frames}
for try in 1 2 3 4 5; do
  python3 cycles/render6.py --data out/cycles6 --out "$OUT" --res "$RES" --spp "$SPP" --frames 0:721 && break
  echo "!! сбой рендера (попытка $try), перезапуск" >&2
  sleep 5
done
echo "ГОТОВО: $(ls "$OUT"/f*.png 2>/dev/null | wc -l) кадров в $OUT"
