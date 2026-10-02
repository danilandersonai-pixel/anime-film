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
  { part: 'upper', at: 17.0, dx: -380, dy: 30, title: 'Дышащий трикотаж', note: 'верх весит 62 г' },
  { part: 'foamTop', at: 17.35, dx: 380, dy: -95, title: 'Пена AIRCELL', note: 'возврат энергии 87 %' },
  { part: 'plate', at: 17.7, dx: 320, dy: 40, title: 'Карбоновая пластина', note: 'жёсткость на отталкивании' },
  { part: 'foamBottom', at: 18.05, dx: -340, dy: 60, title: 'Второй слой пены', note: 'мягкое приземление' },
  { part: 'outsole', at: 18.4, dx: -260, dy: 130, title: 'Протектор-шеврон', note: 'сцепление на мокром' },
];
// подписи к макропланам: [план, начало, конец, номер, заголовок, пояснение]
const FEATURES = [
  ['knit', 4.25, 5.85, '01', 'Трикотаж 3D-вязки', 'плотный на пятке, дышащий на носке'],
  ['laces', 6.25, 7.85, '02', 'Шнуровка без давления', 'семь пар блочек и тросики к подошве'],
  ['heel', 8.25, 9.85, '03', 'Жёсткий задник', 'держит пятку на поворотах'],
  ['flip', 14.6, 15.9, '04', 'Протектор-шеврон', 'сцепление на мокром асфальте'],
];
const WORDS = [[23.0, 'ЛЕГЧЕ.'], [23.5, 'БЫСТРЕЕ.'], [24.0, 'ДАЛЬШЕ.'], [24.5, 'ТВОЙ ТЕМП.']];

export function createOverlay(svg) {
  svg.innerHTML = '';
  const g = (id) => el('g', { id }, svg);
  const D = 'font-family: Unbounded, Manrope, "Arial Black", sans-serif;';
  const B = 'font-family: Manrope, "Segoe UI", Arial, sans-serif;';
  const ACC = 'var(--accent, #ff5a1f)';

  // темнота: марка
  const gR = g('o-dark');
  const rBrand = text(gR, 'ORBITA', { x: 960, y: 960, 'text-anchor': 'middle', style: D + 'font-weight:600;font-size:30px;letter-spacing:14px', fill: '#f2f2f4' });

  // подписи к макропланам
  const gF = g('o-feature');
  const fLine = el('rect', { x: 112, y: 846, width: 56, height: 4, fill: ACC }, gF);
  const fNum = text(gF, '', { x: 186, y: 852, style: B + 'font-weight:700;font-size:22px;letter-spacing:6px', fill: '#c9cdd4' });
  const fTitle = text(gF, '', { x: 108, y: 930, style: D + 'font-weight:700;font-size:58px', fill: '#f5f5f7' });
  const fNote = text(gF, '', { x: 112, y: 982, style: B + 'font-weight:500;font-size:30px', fill: '#b9bdc6' });

  // заголовок после отъезда
  const gH = g('o-title');
  const hEye = text(gH, 'НОВИНКА ORBITA', { x: 112, y: 128, style: B + 'font-weight:700;font-size:22px;letter-spacing:7px', fill: ACC });
  const hTitle = text(gH, 'PULSE ONE', { x: 104, y: 262, style: D + 'font-weight:800;font-size:132px', fill: '#f5f5f7' });
  const hSub = text(gH, 'Карбон. Две пены. Ничего лишнего.', { x: 112, y: 322, style: B + 'font-weight:500;font-size:34px', fill: '#b9bdc6' });

  // сверху: вес
  const gT = g('o-top');
  const tNum = text(gT, '198 г', { x: 110, y: 230, style: D + 'font-weight:800;font-size:130px', fill: '#f5f5f7' });
  const tLab = text(gT, 'в размере 42 — легче, чем кажется', { x: 114, y: 290, style: B + 'font-weight:500;font-size:32px', fill: '#b9bdc6' });

  // выноски взрыв-схемы
  const gC = g('o-callouts');
  const calls = CALLOUTS.map((C) => {
    const gg = el('g', {}, gC);
    const c = {
      g: gg,
      line: el('polyline', { fill: 'none', stroke: '#e9ebef', 'stroke-width': 2, 'stroke-opacity': 0.75 }, gg),
      dot: el('circle', { r: 7, fill: '#ffffff' }, gg),
      ring: el('circle', { r: 16, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, 'stroke-opacity': 0.5 }, gg),
      title: text(gg, C.title, { style: D + 'font-weight:600;font-size:30px', fill: '#f5f5f7' }),
      note: text(gg, C.note, { style: B + 'font-weight:500;font-size:24px', fill: '#aeb3bd' }),
    };
    return c;
  });

  // бег: цифра
  const gS = g('o-stat');
  const sEye = text(gS, 'ПЕНА AIRCELL', { x: 114, y: 790, style: B + 'font-weight:700;font-size:22px;letter-spacing:7px', fill: ACC });
  const sNum = text(gS, '87 %', { x: 104, y: 938, style: D + 'font-weight:800;font-size:150px', fill: '#f5f5f7' });
  const sLab = text(gS, 'энергии возвращается в шаг', { x: 114, y: 992, style: B + 'font-weight:500;font-size:34px', fill: '#b9bdc6' });

  // анфас: слова на ударах
  const gWd = g('o-words');
  const wWord = text(gWd, '', { x: 960, y: 980, 'text-anchor': 'middle', style: D + 'font-weight:800;font-size:96px', fill: '#f5f5f7' });

  // расцветки
  const gW = g('o-colors');
  const wIdx = text(gW, '', { x: 112, y: 860, style: B + 'font-weight:700;font-size:22px;letter-spacing:7px', fill: '#b9bdc6' });
  const wName = text(gW, '', { x: 104, y: 975, style: D + 'font-weight:800;font-size:120px', fill: '#f5f5f7' });

  // пэкшот
  const gP = g('o-pack');
  const pLogo = el('g', {}, gP), pLogoIn = el('g', { transform: 'translate(112 110)' }, pLogo);
  el('ellipse', { cx: 34, cy: 26, rx: 34, ry: 14, fill: 'none', stroke: '#f5f5f7', 'stroke-width': 4, transform: 'rotate(-8 34 26)' }, pLogoIn);
  el('circle', { cx: 60, cy: 16, r: 7, fill: ACC, stroke: '#0b0c10', 'stroke-width': 3 }, pLogoIn);
  text(pLogoIn, 'ORBITA', { x: 88, y: 38, style: D + 'font-weight:600;font-size:34px;letter-spacing:9px', fill: '#f5f5f7' });
  const pTitle = text(gP, 'PULSE ONE', { x: 104, y: 836, style: D + 'font-weight:800;font-size:112px', fill: '#f5f5f7' });
  const pTag = text(gP, 'Отрывайся от земли.', { x: 110, y: 910, style: B + 'font-weight:600;font-size:46px', fill: '#f5f5f7' });
  const pSpec = text(gP, '198 г  ·  дроп 8 мм  ·  карбоновая пластина', { x: 112, y: 968, style: B + 'font-weight:500;font-size:28px', fill: '#9fa4ae' });
  const pCta = el('g', {}, gP);
  el('rect', { x: 1528, y: 930, width: 282, height: 62, rx: 31, fill: 'none', stroke: ACC, 'stroke-width': 2.5 }, pCta);
  text(pCta, 'Скоро в продаже', { x: 1669, y: 970, 'text-anchor': 'middle', style: B + 'font-weight:700;font-size:26px', fill: '#f5f5f7' });

  const all = [gR, gF, gH, gT, gC, gS, gWd, gW, gP];
  const show = (x) => x.removeAttribute('display');

  function update(t, S, project, accent) {
    svg.style.setProperty('--accent', accent);
    all.forEach((x) => x.setAttribute('display', 'none'));
    const shot = S.shot;
    if (shot === 'dark') { show(gR); reveal(rBrand, t, 2.3, 3.1, 3.55, 3.95, 0, 18); }
    const F = FEATURES.find((f) => f[0] === shot);
    if (F) {
      show(gF);
      const [, a, b, num, title, note] = F;
      fNum.textContent = `${num} / 04`; fTitle.textContent = title; fNote.textContent = note;
      reveal(fNum, t, a, a + 0.35, b - 0.3, b, 10, 6);
      reveal(fTitle, t, a + 0.05, a + 0.5, b - 0.3, b, 24, 14);
      reveal(fNote, t, a + 0.2, a + 0.6, b - 0.3, b, 14);
      const k = easeOut(seg(t, a, a + 0.5)) * (1 - seg(t, b - 0.3, b));
      fLine.setAttribute('width', (56 * k).toFixed(1));
    }
    if (shot === 'pull') {
      show(gH);
      reveal(hEye, t, 11.0, 11.35, 11.75, 11.98, 16, 10);
      reveal(hTitle, t, 11.05, 11.5, 11.75, 11.98, 40, 30);
      reveal(hSub, t, 11.25, 11.6, 11.75, 11.98, 20);
    }
    if (shot === 'top') { show(gT); reveal(tNum, t, 12.4, 12.9, 13.6, 13.95, 30, 20); reveal(tLab, t, 12.6, 13.0, 13.6, 13.95, 16); }
    if (shot === 'explode') {
      show(gC);
      calls.forEach((c, i) => {
        const C = CALLOUTS[i];
        const a = seg(t, C.at, C.at + 0.35) * (1 - seg(t, 19.0, 19.25));
        c.g.setAttribute('opacity', a.toFixed(3));
        if (a <= 0) return;
        const p = project(C.part);
        const L = easeOut(seg(t, C.at, C.at + 0.45));
        const ex = p[0] + C.dx * 0.55 * L, ey = p[1] + C.dy * L, fx = p[0] + C.dx * L;
        c.line.setAttribute('points', `${p[0].toFixed(1)},${p[1].toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)} ${fx.toFixed(1)},${ey.toFixed(1)}`);
        c.dot.setAttribute('cx', p[0]); c.dot.setAttribute('cy', p[1]);
        c.ring.setAttribute('cx', p[0]); c.ring.setAttribute('cy', p[1]);
        const ph = (t * 1.3 + i * 0.2) % 1;
        c.ring.setAttribute('r', (10 + 14 * ph).toFixed(1));
        c.ring.setAttribute('stroke-opacity', (0.6 * (1 - ph)).toFixed(2));
        const right = C.dx > 0, tx = fx + (right ? 14 : -14);
        for (const [n, yo] of [[c.title, -10], [c.note, 26]]) {
          n.setAttribute('x', tx.toFixed(1)); n.setAttribute('y', (ey + yo).toFixed(1));
          n.setAttribute('text-anchor', right ? 'start' : 'end');
        }
      });
    }
    if (shot === 'run') {
      show(gS);
      reveal(sEye, t, 21.15, 21.6, 22.7, 23, 14, 8);
      reveal(sNum, t, 21.2, 21.8, 22.7, 23, 30);
      sNum.textContent = `${Math.round(87 * easeOut(seg(t, 21.2, 22.1)))} %`;
      reveal(sLab, t, 21.5, 22.0, 22.7, 23, 16);
    }
    if (shot === 'front') {
      show(gWd);
      let w = WORDS[0];
      for (const x of WORDS) if (t >= x[0]) w = x;
      wWord.textContent = w[1];
      const k = easeOut(seg(t, w[0], w[0] + 0.18));
      wWord.setAttribute('opacity', (k * (1 - seg(t, 24.85, 25))).toFixed(3));
      wWord.setAttribute('transform', `translate(960 980) scale(${(1.25 - 0.25 * k).toFixed(3)}) translate(-960 -980)`);
    }
    if (shot === 'colors') {
      show(gW);
      const first = t < 26;
      wName.textContent = first ? 'GLACIER' : 'VOLT';
      wIdx.textContent = first ? 'РАСЦВЕТКА 02 / 03' : 'РАСЦВЕТКА 03 / 03';
      const t0 = first ? 25 : 26;
      reveal(wName, t, t0 + 0.05, t0 + 0.4, t0 + 0.85, t0 + 1.0, 24, 20);
      reveal(wIdx, t, t0 + 0.1, t0 + 0.4, t0 + 0.85, t0 + 1.0, 12);
    }
    if (shot === 'pack') {
      show(gP);
      gP.setAttribute('opacity', (1 - seg(t, 31.35, 32)).toFixed(3));
      reveal(pLogo, t, 27.35, 27.9, 1e9, 1e9, 0);
      reveal(pTitle, t, 27.6, 28.4, 1e9, 1e9, 36, 26);
      reveal(pTag, t, 28.5, 29.1, 1e9, 1e9, 20);
      reveal(pSpec, t, 29.0, 29.5, 1e9, 1e9, 14);
      reveal(pCta, t, 29.4, 29.9, 1e9, 1e9, 12);
    }
  }
  return { update };
}
