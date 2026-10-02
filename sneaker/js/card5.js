// card5.js — единственная надпись ролика v5: финальная карточка на пэкшоте.
// Знак (орбита со спутником), ORBITA, PULSE ONE и одна фраза. SVG в координатах 1920×1080,
// фон прозрачный — карточка ложится поверх кадров Cycles в ffmpeg.
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

export const CARD_IN = 23.7; // появление — вместе с колокольчиком в звуке

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

export function createCard(svg, accent = '#ff5a1f') {
  svg.innerHTML = '';
  const D = "font-family: Unbounded, 'Arial Black', sans-serif;";
  const B = "font-family: Manrope, 'Segoe UI', Arial, sans-serif;";
  const defs = el('defs', {}, svg);
  const sh = el('filter', { id: 'soft', x: '-20%', y: '-40%', width: '140%', height: '180%' }, defs);
  el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 10, 'flood-color': '#000', 'flood-opacity': 0.55 }, sh);
  const root = el('g', { filter: 'url(#soft)' }, svg);
  const drift = el('g', {}, root);

  // знак: наклонная орбита и спутник на ней
  const mark = el('g', { transform: 'translate(150 742)' }, drift);
  const orbit = el('ellipse', { cx: 40, cy: 30, rx: 40, ry: 16, fill: 'none', stroke: '#f3f3f5', 'stroke-width': 4.5, transform: 'rotate(-9 40 30)', pathLength: 100, 'stroke-dasharray': '100 100' }, mark);
  const moon = el('circle', { cx: 70, cy: 18, r: 8, fill: accent }, mark);
  const brand = el('text', { x: 252, y: 784, style: D + 'font-weight:600;font-size:36px', fill: '#f3f3f5' }, drift);
  brand.textContent = 'ORBITA';
  const title = el('text', { x: 144, y: 902, style: D + 'font-weight:800;font-size:104px;letter-spacing:1px', fill: '#f5f5f7' }, drift);
  title.textContent = 'PULSE ONE';
  const tag = el('text', { x: 150, y: 968, style: B + 'font-weight:600;font-size:42px', fill: '#e9eaee' }, drift);
  tag.textContent = 'Отрывайся от земли.';

  function update(t) {
    svg.setAttribute('display', t < CARD_IN ? 'none' : 'inline');
    const a = CARD_IN;
    // орбита прорисовывается, спутник выходит на неё
    const ko = easeOut(seg(t, a, a + 0.65));
    orbit.setAttribute('stroke-dashoffset', (100 * (1 - ko)).toFixed(2));
    orbit.setAttribute('opacity', Math.min(1, ko * 3).toFixed(3));
    const km = easeOut(seg(t, a + 0.35, a + 0.7));
    moon.setAttribute('opacity', km.toFixed(3));
    moon.setAttribute('r', (8 * (0.4 + 0.6 * km)).toFixed(2));
    // буквы сходятся из разрядки
    const kb = easeOut(seg(t, a + 0.05, a + 0.7));
    brand.setAttribute('opacity', kb.toFixed(3));
    brand.setAttribute('letter-spacing', (10 + 14 * (1 - kb)).toFixed(1));
    const kt = easeOut(seg(t, a + 0.2, a + 0.85));
    title.setAttribute('opacity', kt.toFixed(3));
    title.setAttribute('transform', `translate(0 ${(26 * (1 - kt)).toFixed(1)})`);
    const kg = easeOut(seg(t, a + 0.5, a + 1.1));
    tag.setAttribute('opacity', kg.toFixed(3));
    tag.setAttribute('transform', `translate(0 ${(14 * (1 - kg)).toFixed(1)})`);
    // едва заметный дрейф, чтобы карточка не была «приклеена»
    const s = 1 + 0.012 * seg(t, a, 26);
    drift.setAttribute('transform', `translate(150 860) scale(${s.toFixed(4)}) translate(-150 -860)`);
  }
  return { update };
}
