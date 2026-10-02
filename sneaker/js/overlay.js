// overlay.js — надписи ролика: SVG в координатах кадра 1920×1080.
// Всё считается от времени t, как и картинка.
const NS = 'http://www.w3.org/2000/svg';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, str, attrs) { const t = el('text', attrs, parent); t.textContent = str; return t; }
// появление: прозрачность, сдвиг и разрядка букв сходятся к нулю
function reveal(node, t, a, b, out0 = 1e9, out1 = 1e9, dy = 26, track = 0) {
  const k = easeOut(seg(t, a, b)) * (1 - seg(t, out0, out1));
  node.setAttribute('opacity', k.toFixed(3));
  node.setAttribute('transform', `translate(0 ${((1 - easeOut(seg(t, a, b))) * dy).toFixed(1)})`);
  if (track) node.setAttribute('letter-spacing', ((1 - easeOut(seg(t, a, b))) * track).toFixed(1));
  return k;
}

export const CALLOUTS = [
  { part: 'upper', at: 9.0, dx: -380, dy: 30, title: 'Дышащий трикотаж', note: 'верх весит 62 г' },
  { part: 'foamTop', at: 9.35, dx: 380, dy: -95, title: 'Пена AIRCELL', note: 'возврат энергии 87 %' },
  { part: 'plate', at: 9.7, dx: 320, dy: 40, title: 'Карбоновая пластина', note: 'жёсткость на отталкивании' },
  { part: 'foamBottom', at: 10.05, dx: -340, dy: 60, title: 'Второй слой пены', note: 'мягкое приземление' },
  { part: 'outsole', at: 10.4, dx: -260, dy: 130, title: 'Протектор-шеврон', note: 'сцепление на мокром' },
];

export function createOverlay(svg) {
  svg.innerHTML = '';
  const g = (id) => el('g', { id }, svg);
  const D = 'font-family: Unbounded, Manrope, "Arial Black", sans-serif;';
  const B = 'font-family: Manrope, "Segoe UI", Arial, sans-serif;';

  // 1. из темноты
  const gR = g('o-reveal');
  const rBrand = text(gR, 'ORBITA', { x: 960, y: 930, 'text-anchor': 'middle', style: D + 'font-weight:600;font-size:30px;letter-spacing:14px', fill: '#f2f2f4' });
  const rLine = text(gR, 'Создана для скорости', { x: 960, y: 985, 'text-anchor': 'middle', style: B + 'font-weight:500;font-size:34px', fill: '#b9bdc6' });

  // 2. герой
  const gH = g('o-hero');
  const hEye = text(gH, 'НОВИНКА ORBITA', { x: 112, y: 778, style: B + 'font-weight:700;font-size:22px;letter-spacing:7px', fill: 'var(--accent, #ff5a1f)' });
  const hTitle = text(gH, 'PULSE ONE', { x: 104, y: 905, style: D + 'font-weight:800;font-size:150px', fill: '#f5f5f7' });
  const hSub = text(gH, 'Карбон. Две пены. Ничего лишнего.', { x: 112, y: 968, style: B + 'font-weight:500;font-size:34px', fill: '#b9bdc6' });

  // 3. подписи к слоям
  const gC = g('o-callouts');
  const calls = CALLOUTS.map(() => {
    const gg = el('g', {}, gC);
    return {
      g: gg,
      line: el('polyline', { fill: 'none', stroke: '#e9ebef', 'stroke-width': 2, 'stroke-opacity': 0.75 }, gg),
      dot: el('circle', { r: 7, fill: '#ffffff' }, gg),
      ring: el('circle', { r: 16, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-opacity': 0.5 }, gg),
      title: text(gg, '', { style: D + 'font-weight:600;font-size:30px', fill: '#f5f5f7' }),
      note: text(gg, '', { style: B + 'font-weight:500;font-size:24px', fill: '#aeb3bd' }),
    };
  });
  calls.forEach((c, i) => { c.title.textContent = CALLOUTS[i].title; c.note.textContent = CALLOUTS[i].note; });

  // 4. бег: цифра
  const gS = g('o-stat');
  const sEye = text(gS, 'ПЕНА AIRCELL', { x: 1808, y: 120, 'text-anchor': 'end', style: B + 'font-weight:700;font-size:22px;letter-spacing:7px', fill: 'var(--accent, #ff5a1f)' });
  const sNum = text(gS, '87 %', { x: 1800, y: 268, 'text-anchor': 'end', style: D + 'font-weight:800;font-size:150px', fill: '#f5f5f7' });
  const sLab = text(gS, 'энергии возвращается в шаг', { x: 1806, y: 322, 'text-anchor': 'end', style: B + 'font-weight:500;font-size:34px', fill: '#b9bdc6' });

  // 5. расцветки
  const gW = g('o-colors');
  const wIdx = text(gW, '', { x: 112, y: 860, style: B + 'font-weight:700;font-size:22px;letter-spacing:7px', fill: '#b9bdc6' });
  const wName = text(gW, '', { x: 104, y: 975, style: D + 'font-weight:800;font-size:120px', fill: '#f5f5f7' });

  // 6. пэкшот
  const gP = g('o-pack');
  const pLogo = el('g', {}, gP), pLogoIn = el('g', { transform: 'translate(112 110)' }, pLogo);
  el('ellipse', { cx: 34, cy: 26, rx: 34, ry: 14, fill: 'none', stroke: '#f5f5f7', 'stroke-width': 4, transform: 'rotate(-8 34 26)' }, pLogoIn);
  el('circle', { cx: 60, cy: 16, r: 7, fill: 'var(--accent, #ff5a1f)', stroke: '#0b0c10', 'stroke-width': 3 }, pLogoIn);
  text(pLogoIn, 'ORBITA', { x: 88, y: 38, style: D + 'font-weight:600;font-size:34px;letter-spacing:9px', fill: '#f5f5f7' });
  const pTitle = text(gP, 'PULSE ONE', { x: 104, y: 836, style: D + 'font-weight:800;font-size:112px', fill: '#f5f5f7' });
  const pTag = text(gP, 'Отрывайся от земли.', { x: 110, y: 910, style: B + 'font-weight:600;font-size:46px', fill: '#f5f5f7' });
  const pSpec = text(gP, '198 г  ·  дроп 8 мм  ·  карбоновая пластина', { x: 112, y: 968, style: B + 'font-weight:500;font-size:28px', fill: '#9fa4ae' });
  const pCta = el('g', {}, gP);
  el('rect', { x: 1528, y: 930, width: 282, height: 62, rx: 31, fill: 'none', stroke: 'var(--accent, #ff5a1f)', 'stroke-width': 2.5 }, pCta);
  text(pCta, 'Скоро в продаже', { x: 1669, y: 970, 'text-anchor': 'middle', style: B + 'font-weight:700;font-size:26px', fill: '#f5f5f7' });

  const groups = [gR, gH, gC, gS, gW, gP];

  function update(t, S, project, accent) {
    svg.style.setProperty('--accent', accent);
    groups.forEach((x) => x.setAttribute('display', 'none'));
    if (S.shot === 'reveal') {
      gR.removeAttribute('display');
      reveal(rBrand, t, 1.3, 2.2, 3.5, 3.95, 0, 18);
      reveal(rLine, t, 2.3, 3.0, 3.5, 3.95, 18);
    } else if (S.shot === 'hero') {
      gH.removeAttribute('display');
      reveal(hEye, t, 4.25, 4.8, 7.5, 7.9, 16, 10);
      reveal(hTitle, t, 4.35, 5.1, 7.5, 7.9, 40, 30);
      reveal(hSub, t, 4.9, 5.5, 7.5, 7.9, 20);
    } else if (S.shot === 'explode') {
      gC.removeAttribute('display');
      calls.forEach((c, i) => {
        const C = CALLOUTS[i];
        const a = seg(t, C.at, C.at + 0.35) * (1 - seg(t, 11.0, 11.25));
        c.g.setAttribute('opacity', a.toFixed(3));
        if (a <= 0) return;
        const p = project(C.part);
        const L = easeOut(seg(t, C.at, C.at + 0.45));
        const ex = p[0] + C.dx * 0.55 * L, ey = p[1] + C.dy * L, fx = p[0] + C.dx * L;
        c.line.setAttribute('points', `${p[0].toFixed(1)},${p[1].toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${fx.toFixed(1)},${ey.toFixed(1)}`);
        c.dot.setAttribute('cx', p[0]); c.dot.setAttribute('cy', p[1]);
        c.ring.setAttribute('cx', p[0]); c.ring.setAttribute('cy', p[1]);
        c.ring.setAttribute('r', (10 + 14 * ((t * 1.3 + i * 0.2) % 1)).toFixed(1));
        c.ring.setAttribute('stroke-opacity', (0.6 * (1 - ((t * 1.3 + i * 0.2) % 1))).toFixed(2));
        const right = C.dx > 0, tx = fx + (right ? 14 : -14);
        for (const [n, yo] of [[c.title, -10], [c.note, 26]]) {
          n.setAttribute('x', tx.toFixed(1)); n.setAttribute('y', (ey + yo).toFixed(1));
          n.setAttribute('text-anchor', right ? 'start' : 'end');
        }
      });
    } else if (S.shot === 'run') {
      gS.removeAttribute('display');
      reveal(sEye, t, 13.15, 13.6, 14.7, 15, 14, 8);
      const k = reveal(sNum, t, 13.2, 13.8, 14.7, 15, 30);
      sNum.textContent = `${Math.round(87 * easeOut(seg(t, 13.2, 14.1)))} %`;
      reveal(sLab, t, 13.5, 14.0, 14.7, 15, 16);
      void k;
    } else if (S.shot === 'colors') {
      gW.removeAttribute('display');
      const first = t < 16;
      wName.textContent = first ? 'GLACIER' : 'VOLT';
      wIdx.textContent = first ? 'РАСЦВЕТКА 02 / 03' : 'РАСЦВЕТКА 03 / 03';
      const t0 = first ? 15 : 16;
      reveal(wName, t, t0 + 0.05, t0 + 0.4, t0 + 0.85, t0 + 1.0, 24, 20);
      reveal(wIdx, t, t0 + 0.1, t0 + 0.4, t0 + 0.85, t0 + 1.0, 12);
    } else {
      gP.removeAttribute('display');
      reveal(pLogo, t, 17.35, 17.9, 1e9, 1e9, 0);
      reveal(pTitle, t, 17.6, 18.4, 1e9, 1e9, 36, 26);
      reveal(pTag, t, 18.5, 19.1, 1e9, 1e9, 20);
      reveal(pSpec, t, 19.0, 19.5, 1e9, 1e9, 14);
      reveal(pCta, t, 19.4, 19.9, 1e9, 1e9, 12);
    }
  }
  return { update };
}
