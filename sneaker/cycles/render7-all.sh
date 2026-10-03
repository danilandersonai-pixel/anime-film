#!/usr/bin/env bash
# render7-all.sh — полный рендер v7 «Кристаллы» в Cycles с перезапуском после сбоя.
# Готовые кадры render7.py пропускает, поэтому скрипт можно запускать повторно.
#   bash cycles/render7-all.sh            # 1280×536 (2.39:1), 16 сэмплов
set -u
cd "$(dirname "$0")/.."
RES=${RES:-1280x536}
SPP=${SPP:-16}
OUT=${OUT:-out/cycles7/frames}
for try in 1 2 3 4 5; do
  python3 cycles/render7.py --data out/cycles7 --out "$OUT" --res "$RES" --spp "$SPP" --frames 0:481 && break
  echo "!! сбой рендера (попытка $try), перезапуск" >&2
  sleep 5
done
echo "ГОТОВО: $(ls "$OUT"/f*.png 2>/dev/null | wc -l) кадров в $OUT"
