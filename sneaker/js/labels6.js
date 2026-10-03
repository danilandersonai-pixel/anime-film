// labels6.js — подписи деталей в разборе (v6): точка на детали, тонкая выноска с изломом
// и название, без цифр. SVG в координатах кадра 1920×1080. Появляются по очереди снизу
// вверх, линия «прорисовывается». Где деталь на экране, считает вызывающий: плеер
// three.js (film6.js) или пост-продакшн для Cycles (post6.html) — по одним и тем же данным.
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const LABELS_IN = 11.0, LABELS_STEP = 0.14;

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

// defs — PARTS из anatomy.js (key, label, side)
export function createLabels(svg, defs) {
  svg.innerHTML = '';
  const B = "font-family: Manrope, 'Segoe UI', Arial, sans-serif;";
  const filt = el('filter', { id: 'lblShadow', x: '-20%', y: '-60%', width: '140%', height: '220%' }, el('defs', {}, svg));
  el('feDropShadow', { dx: 0, dy: 2, stdDeviation: 5, 'flood-color': '#000', 'flood-opacity': 0.8 }, filt);
  const items = defs.map((d) => {
    const g = el('g', { filter: 'url(#lblShadow)' }, svg);
    return {
      d, g,
      line: el('polyline', { fill: 'none', stroke: '#f2f2f4', 'stroke-width': 1.6, 'stroke-opacity': 0.8, 'stroke-linecap': 'round' }, g),
      dot: el('circle', { r: 4.5, fill: '#ffffff' }, g),
      ring: el('circle', { r: 11, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.4 }, g),
      text: (() => { const t = el('text', { style: B + 'font-weight:600;font-size:27px;letter-spacing:0.5px', fill: '#f5f5f7' }, g); t.textContent = d.label; return t; })(),
    };
  });

  // t — время ролика; amount — общая видимость (S.labels); pts — { key: [x, y, видна] }, cx — центр «разреза» на экране
  function update(t, amount, pts, cx = 960) {
    svg.setAttribute('display', amount > 0.001 ? 'inline' : 'none');
    if (amount <= 0.001) return;
    // раскладка по сторонам: подписи слева и справа от разреза, без наложений по высоте
    const rows = { '-1': [], 1: [] };
    items.forEach((it, i) => {
      const p = pts[it.d.key];
      const a = easeOut(seg(t, LABELS_IN + LABELS_STEP * i, LABELS_IN + LABELS_STEP * i + 0.45)) * amount;
      it.a = p && p[2] ? a : 0;
      if (it.a > 0) rows[it.d.side].push({ it, x: p[0], y: p[1] });
    });
    for (const side of ['-1', '1']) {
      const r = rows[side].sort((p, q) => p.y - q.y);
      for (let k = 1; k < r.length; k++) r[k].ty = Math.max(r[k].y, (r[k - 1].ty ?? r[k - 1].y) + 46);
      if (r.length) r[0].ty = r[0].ty ?? r[0].y;
      for (const q of r) {
        const { it } = q, s = Number(side), ty = q.ty ?? q.y;
        const ex = cx + s * 360, tx = Math.min(1800, Math.max(120, cx + s * 430));
        const reach = easeOut(seg(it.a, 0, 0.8));
        const midX = q.x + (ex - q.x) * reach, endX = ex + (tx - ex) * reach;
        it.line.setAttribute('points', `${q.x.toFixed(1)},${q.y.toFixed(1)} ${midX.toFixed(1)},${(q.y + (ty - q.y) * reach).toFixed(1)} ${endX.toFixed(1)},${(q.y + (ty - q.y) * reach).toFixed(1)}`);
        it.dot.setAttribute('cx', q.x.toFixed(1)); it.dot.setAttribute('cy', q.y.toFixed(1));
        const ph = (t * 1.2 + it.d.off[1]) % 1;
        it.ring.setAttribute('cx', q.x.toFixed(1)); it.ring.setAttribute('cy', q.y.toFixed(1));
        it.ring.setAttribute('r', (8 + 12 * ph).toFixed(1)); it.ring.setAttribute('stroke-opacity', (0.55 * (1 - ph)).toFixed(2));
        it.text.setAttribute('x', (tx + s * 14).toFixed(1)); it.text.setAttribute('y', (ty + 9).toFixed(1));
        it.text.setAttribute('text-anchor', s > 0 ? 'start' : 'end');
        it.text.setAttribute('opacity', seg(it.a, 0.45, 1).toFixed(3));
      }
    }
    for (const it of items) it.g.setAttribute('opacity', it.a > 0 ? Math.min(1, it.a * 2).toFixed(3) : '0');
  }
  return { update };
}
