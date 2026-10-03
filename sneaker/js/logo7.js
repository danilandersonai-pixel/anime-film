// logo7.js — надписи v7 «Кристаллы»: тонкая широкая PULSE ONE внизу по центру (внутри
// кинорамки) и знак ORBITA в правом верхнем углу — как подпись бренда в рекламном ролике.
// SVG в координатах 1920×1080, фон прозрачный — ложится поверх кадров Cycles в ffmpeg.
import { LOGO_T } from './timeline7.js';
import { LETTERBOX } from './stage.js';

const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

export function createLogo(svg, { at = LOGO_T } = {}) {
  svg.innerHTML = '';
  const D = "font-family: Unbounded, 'Arial Black', sans-serif;";
  const defs = el('defs', {}, svg);
  const glow = el('filter', { id: 'l7glow', x: '-20%', y: '-60%', width: '140%', height: '220%' }, defs);
  el('feGaussianBlur', { stdDeviation: 6, result: 'b' }, glow);
  const fm = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, fm); el('feMergeNode', { in: 'SourceGraphic' }, fm);
  const root = el('g', {}, svg);
  const barH = LETTERBOX * 1080;

  // PULSE ONE: внизу по центру, над нижней полосой рамки
  const title = el('text', { x: 960, y: (1080 - barH - 52).toFixed(1), 'text-anchor': 'middle', style: D + 'font-weight:400;font-size:44px', fill: '#f4f5f7', filter: 'url(#l7glow)' }, root);
  title.textContent = 'PULSE ONE';
  // знак ORBITA: орбита со спутником и название — справа сверху, под верхней полосой
  const mark = el('g', { transform: `translate(1668 ${(barH + 44).toFixed(1)})` }, root);
  const orbit = el('ellipse', { cx: 30, cy: 22, rx: 30, ry: 12, fill: 'none', stroke: '#f3f3f5', 'stroke-width': 3.2, transform: 'rotate(-9 30 22)', pathLength: 100, 'stroke-dasharray': '100 100' }, mark);
  const moon = el('circle', { cx: 52.5, cy: 13, r: 6, fill: '#ff5a1f' }, mark);
  const brand = el('text', { x: 74, y: 31, style: D + 'font-weight:600;font-size:23px', fill: '#f3f3f5' }, mark);
  brand.textContent = 'ORBITA';

  function update(t, S) {
    svg.setAttribute('display', t < at ? 'none' : 'inline');
    const out = 1 - (S ? S.fade : 0);
    // буквы сходятся из широкой разрядки
    const kt = easeOut(seg(t, at, at + 1.1));
    title.setAttribute('opacity', (kt * out).toFixed(3));
    title.setAttribute('letter-spacing', (20 + 26 * (1 - kt)).toFixed(1));
    // орбита прорисовывается, спутник выходит на неё
    const ko = easeOut(seg(t, at + 0.35, at + 1.0));
    orbit.setAttribute('stroke-dashoffset', (100 * (1 - ko)).toFixed(2));
    orbit.setAttribute('opacity', (Math.min(1, ko * 3) * out).toFixed(3));
    const km = easeOut(seg(t, at + 0.7, at + 1.05));
    moon.setAttribute('opacity', (km * out).toFixed(3));
    moon.setAttribute('r', (6 * (0.4 + 0.6 * km)).toFixed(2));
    const kb = easeOut(seg(t, at + 0.5, at + 1.15));
    brand.setAttribute('opacity', (kb * out).toFixed(3));
    brand.setAttribute('letter-spacing', (3 + 8 * (1 - kb)).toFixed(1));
  }
  return { update };
}
