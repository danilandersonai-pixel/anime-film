"""Рендер v7 «Кристаллы» в Blender Cycles: туманный мир плит и кристаллов над тёмной водой.

Кроссовок (Lunar) и мир (плиты, обломки, кристаллы) — из GLB, которые выгрузил three.js
(tools/export-cycles7.cjs); полёт, камера, свет, шары, круги на воде — из frames7.json.
Вода, небо, полосы тумана, шары, капля и свет — здесь.

    python3 cycles/render7.py --data out/cycles7 --out out/cycles7/frames \
        --res 1280x536 --spp 24 --frames 0:481[:шаг] [--only 120,300] [--save scene.blend]

Кадр — 2.39:1: та же ширина поля зрения, что у 16:9 в плеере (там рамка — чёрные полосы).
Туман — как FogExp2 в three.js: в каждом материале смесь с цветом тумана по длине луча
T = exp(−(ρ·d)²) — так туманятся и отражения в воде, и предметы сквозь кристаллы.
Единицы: 1 = 10 см, как в three.js. Ось Y three.js → ось Z Blender.
Свет — в единицах плеера: площадной — яркость L (Вт = L·π·S), прожектор и точечный — сила I (Вт = I·4π).
"""
import argparse, json, math, os, time
import bpy
from mathutils import Matrix, Vector

ap = argparse.ArgumentParser()
ap.add_argument('--data', default='out/cycles7')
ap.add_argument('--out', default='out/cycles7/frames')
ap.add_argument('--res', default='1280x536')
ap.add_argument('--spp', type=int, default=24)
ap.add_argument('--frames', default='0:481')
ap.add_argument('--only', default='')
ap.add_argument('--save', default='')
A = ap.parse_args()
DATA = json.load(open(os.path.join(A.data, 'frames7.json')))
FR = DATA['frames']
UPPER_GAIN = DATA['meta'].get('upperGain', 2.3)
LIFT = float(os.environ.get('LIFT', 0.55))   # подъём тёмных промежутков трикотажа

# константы мира — те же, что в js/cavestage.js и js/timeline7.js
SKY = {'top': '#1b2532', 'horizon': '#5d6f84', 'below': '#0c1016', 'fog': '#4b5b6e'}
KEY_OFF = (6, 10.1, 9)
ORB_L = 2.5
WARM_EMIT = 0.32
WARM_GLOW = [(-1.6, 1.5, -1.6), (1.5, 1.3, -1.5)]
MIST = [(0, -12, 60, 2.5), (-10, -24, 90, 5), (8, -40, 120, 9), (0, -58, 200, 14), (12, 12, 40, 1.4), (-20, 2, 50, 3)]

# three.js (Y вверх) → Blender (Z вверх)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()
def m3(a):  # матрица three.js (по столбцам) → Blender
    M = Matrix([[a[c * 4 + r] for c in range(4)] for r in range(4)])
    return C @ M @ CI
def v3(x, y, z):
    return Vector((x, -z, y))
def lin(hexs):  # sRGB → линейный цвет
    c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'

# ---------------------------------------------------------------------
# Узлы: короткие помощники
# ---------------------------------------------------------------------
class G:
    def __init__(self, nt):
        self.nt, self.N, self.L = nt, nt.nodes, nt.links
    def node(self, kind, **kw):
        n = self.N.new(kind)
        for k, v in kw.items():
            if k in n.inputs.keys() and not hasattr(n, k):
                n.inputs[k].default_value = v
            else:
                setattr(n, k, v)
        return n
    def link(self, a, b):
        self.L.new(a, b)
    def math(self, op, a, b=None, clamp=False):
        n = self.N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[i].default_value = x
            else:
                self.L.new(x, n.inputs[i])
        return n.outputs[0]
    def vmath(self, op, a, b=None):
        n = self.N.new('ShaderNodeVectorMath'); n.operation = op
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (tuple, list)):
                n.inputs[i].default_value = x
            else:
                self.L.new(x, n.inputs[i])
        return n.outputs['Vector'] if op not in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE') else n.outputs['Value']
    def smooth(self, x, a, b):   # smoothstep(a, b, x)
        n = self.N.new('ShaderNodeMapRange'); n.interpolation_type = 'SMOOTHSTEP'
        n.inputs['From Min'].default_value = a; n.inputs['From Max'].default_value = b
        self.L.new(x, n.inputs['Value'])
        return n.outputs['Result']
    def mixc(self, a, b, fac, blend='MIX', clamp=False):   # смешать цвета
        n = self.N.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend; n.clamp_result = clamp
        for sock, x in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(x, (int, float)):
                sock.default_value = x
            elif isinstance(x, tuple):
                sock.default_value = (*x, 1) if len(x) == 3 else x
            else:
                self.L.new(x, sock)
        return n.outputs[2]
    def noise(self, vec, scale, detail=4, rough=0.5):
        n = self.N.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        if vec is not None:
            self.L.new(vec, n.inputs['Vector'])
        return n.outputs['Fac']
    def out(self):
        return next(n for n in self.N if n.type == 'OUTPUT_MATERIAL')

def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    for n in list(m.node_tree.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            m.node_tree.nodes.remove(n)
    return m, G(m.node_tree)

def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None

# туман по длине луча: смесь с излучением цвета тумана, ρ — общий ключ кадра
FOG_SOCKS = []
FOG_COLOR = (*lin(SKY['fog']), 1)
def add_fog(mat):
    g = G(mat.node_tree); o = g.out()
    if not o.inputs['Surface'].links:
        return
    src = o.inputs['Surface'].links[0].from_socket
    lp = g.node('ShaderNodeLightPath'); dn = g.node('ShaderNodeValue'); FOG_SOCKS.append(dn.outputs[0])
    tt = g.math('EXPONENT', g.math('MULTIPLY', g.math('POWER', g.math('MULTIPLY', lp.outputs['Ray Length'], dn.outputs[0]), 2), -1))
    fac = g.math('SUBTRACT', 1.0, tt)
    em = g.node('ShaderNodeEmission'); em.inputs['Color'].default_value = FOG_COLOR; em.inputs['Strength'].default_value = 1.0
    mx = g.node('ShaderNodeMixShader')
    g.link(fac, mx.inputs['Fac']); g.link(src, mx.inputs[1]); g.link(em.outputs[0], mx.inputs[2]); g.link(mx.outputs[0], o.inputs['Surface'])

# ---------------------------------------------------------------------
# Кроссовок
# ---------------------------------------------------------------------
# подкладка в three.js — та же поверхность, что верх, но видна только изнутри (BackSide);
# в glTF изнанки нет, и в Cycles она легла бы прямо поверх верха. Сдвигаем её внутрь и разворачиваем.
def fix_lining(objs):
    for o in objs:
        if o.type == 'MESH' and o.name.split('.')[0] == 'lining':
            me = o.data
            for v in me.vertices:
                v.co -= v.normal * 0.006
            me.flip_normals()

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(A.data, 'shoe.glb'))
SHOE_OBJS = [o for o in bpy.data.objects if o not in before]
SHOE = next(o for o in SHOE_OBJS if o.name.split('.')[0] == 'shoe')
fix_lining(SHOE_OBJS)
done = set()
for o in SHOE_OBJS:
    if o.type != 'MESH':
        continue
    for slot in o.material_slots:
        m = slot.material
        if not m or m.name in done:
            continue
        done.add(m.name)
        b = principled(m); k = m.name.split('.')[0]
        if b is not None:
            if k == 'upper':                                   # белый трикотаж: ворс и яркость
                b.inputs['Sheen Weight'].default_value = 0.45; b.inputs['Sheen Roughness'].default_value = 0.55
                lk = b.inputs['Base Color'].links
                if lk:
                    g = G(m.node_tree); src = lk[0].from_socket
                    # в плеере цвет ×UPPER_GAIN не ограничен (петли ярче 1), а Principled в Cycles
                    # режет цвет до 1 — поэтому здесь ещё и подняты тёмные промежутки между петлями
                    gain = g.mixc(src, (UPPER_GAIN, UPPER_GAIN, UPPER_GAIN), 1.0, 'MULTIPLY')
                    g.link(g.mixc(gain, (1.0, 1.0, 1.0), LIFT), b.inputs['Base Color'])
            elif k in ('foamTop', 'foamBottom'):               # пена пропускает свет
                b.inputs['Subsurface Weight'].default_value = 0.25
                b.inputs['Subsurface Radius'].default_value = (1.0, 0.75, 0.55); b.inputs['Subsurface Scale'].default_value = 0.08
        add_fog(m)
print('кроссовок: объектов', len(SHOE_OBJS), 'материалов', len(done), flush=True)

# ---------------------------------------------------------------------
# Мир: плиты, обломки, кристаллы
# ---------------------------------------------------------------------
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=os.path.join(A.data, 'cave.glb'))
CAVE = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']

def rock_mat(island):
    m, g = new_mat('island' if island else 'rock')
    bs = g.node('ShaderNodeBsdfPrincipled'); g.link(bs.outputs[0], g.out().inputs['Surface'])
    tc = g.node('ShaderNodeTexCoord'); geo = g.node('ShaderNodeNewGeometry')
    W = geo.outputs['Position']; Lc = tc.outputs['Object']
    sw = g.node('ShaderNodeSeparateXYZ'); g.link(W, sw.inputs[0])
    sl = g.node('ShaderNodeSeparateXYZ'); g.link(Lc, sl.inputs[0])
    # слои породы: по высоте в координатах плиты, слегка волнистые
    lf = g.math('ADD', g.math('MULTIPLY', sl.outputs['Z'], 6.5), g.math('MULTIPLY', g.noise(g.vmath('MULTIPLY', Lc, (0.35, 0.35, 0.1)), 1.0, 3), 2.5))
    band = g.smooth(g.math('ABSOLUTE', g.math('SINE', g.math('MULTIPLY', lf, math.pi))), 0.75, 1.0)
    rk = g.math('ADD', g.math('MULTIPLY', g.noise(W, 1.1 * 1.0, 5), 0.6), g.math('MULTIPLY', g.noise(g.vmath('MULTIPLY', Lc, (1.5, 1.5, 9.0)), 1.0, 4), 0.4))
    wet = g.math('SUBTRACT', 1.0, g.smooth(sw.outputs['Z'], 0.02, 0.32))
    base = g.mixc((0.07, 0.075, 0.085), (0.24, 0.25, 0.27), rk)
    # слои — неровные: сила полосы гуляет вдоль плиты
    band = g.math('MULTIPLY', band, g.smooth(g.noise(g.vmath('MULTIPLY', Lc, (0.6, 0.6, 0.6)), 1.0, 2), 0.35, 0.7))
    base = g.mixc(base, g.math('ADD', 1.0, g.math('MULTIPLY', band, 0.3)), 1.0, 'MULTIPLY')
    rough = g.math('SUBTRACT', g.math('ADD', g.math('MULTIPLY', wet, -0.42), 0.62), g.math('MULTIPLY', rk, 0.12))
    metal = 0.0
    if island:
        # ржавчина и золотые блёстки, как в плеере
        rust = g.smooth(g.noise(g.vmath('ADD', g.vmath('MULTIPLY', W, (0.9, 0.9, 0.9)), (3.1, 1.7, 0.0)), 1.0, 5), 0.5, 0.72)
        rcol = g.mixc((0.12, 0.045, 0.018), (0.28, 0.105, 0.042), rk)
        base = g.mixc(base, rcol, g.math('MULTIPLY', rust, 0.55))
        gold = g.math('MULTIPLY', g.smooth(g.noise(W, 16.0, 1), 0.76, 0.82), g.smooth(g.noise(g.vmath('ADD', W, (2.0, 2.0, 2.0)), 1.7, 5), 0.42, 0.6))
        base = g.mixc(base, (0.95, 0.6, 0.22), gold)
        rough = g.math('ADD', g.math('MULTIPLY', rough, g.math('SUBTRACT', 1.0, gold)), g.math('MULTIPLY', gold, 0.28))
        metal = gold
    base = g.mixc(base, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', wet, 0.5)), 1.0, 'MULTIPLY')
    g.link(base, bs.inputs['Base Color'])
    g.link(rough, bs.inputs['Roughness'])
    if not isinstance(metal, float):
        g.link(metal, bs.inputs['Metallic'])
    # рельеф: мелкий шум и уступы слоёв (слабее на мокром)
    bump = g.node('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.02
    h = g.math('ADD', g.math('ADD', g.noise(W, 3.0, 6), g.math('MULTIPLY', g.noise(W, 11.0, 8, 0.6), 0.5)), g.math('MULTIPLY', g.math('SINE', g.math('MULTIPLY', lf, 2 * math.pi)), 0.08))
    g.link(h, bump.inputs['Height']); g.link(g.math('SUBTRACT', 1.0, g.math('MULTIPLY', wet, 0.7)), bump.inputs['Strength'])
    g.link(bump.outputs['Normal'], bs.inputs['Normal'])
    add_fog(m)
    return m

def crystal_mat(warm):
    m, g = new_mat('crystal_warm' if warm else 'crystal_cold')
    bs = g.node('ShaderNodeBsdfPrincipled'); g.link(bs.outputs[0], g.out().inputs['Surface'])
    bs.inputs['Metallic'].default_value = 0; bs.inputs['Roughness'].default_value = 0.03 if not warm else 0.04
    bs.inputs['IOR'].default_value = 1.55; bs.inputs['Transmission Weight'].default_value = 1.0
    if 'Thin Film Thickness' in bs.inputs:   # радужный отлив граней
        bs.inputs['Thin Film Thickness'].default_value = 0 if warm else 260; bs.inputs['Thin Film IOR'].default_value = 1.6
    va = g.node('ShaderNodeVolumeAbsorption')
    if warm:
        bs.inputs['Base Color'].default_value = (1.0, 0.5, 0.26, 1)
        va.inputs['Color'].default_value = (1.0, 0.28, 0.07, 1); va.inputs['Density'].default_value = 1.6
        # свечение изнутри, сильнее к острию: 0,25 + 1,75·tip²; яркость — ключ кадра (crystal)
        at = g.node('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = '_TIPK'
        tip = g.math('ADD', g.math('MULTIPLY', g.math('POWER', at.outputs['Fac'], 2), 1.75), 0.25)
        kv = g.node('ShaderNodeValue'); kv.label = 'crystal'
        g.link(g.math('MULTIPLY', tip, kv.outputs[0]), bs.inputs['Emission Strength'])
        bs.inputs['Emission Color'].default_value = (*lin('#ff4a10'), 1)
        m['crystal_sock'] = 1
        CRYSTAL_SOCKS.append(kv.outputs[0])
    else:
        # кварц: прозрачный, но чуть молочный — ловит свет неба и «луны», а не тонет в темноте
        bs.inputs['Base Color'].default_value = (0.93, 0.96, 1.0, 1); bs.inputs['Transmission Weight'].default_value = 0.6
        bs.inputs['Roughness'].default_value = 0.08; bs.inputs['Coat Weight'].default_value = 0.6; bs.inputs['Coat Roughness'].default_value = 0.02
        va.inputs['Color'].default_value = (0.86, 0.93, 1.0, 1); va.inputs['Density'].default_value = 0.25
    g.link(va.outputs[0], g.out().inputs['Volume'])
    add_fog(m)
    return m

CRYSTAL_SOCKS = []
MATS = {'rock': rock_mat(False), 'island': rock_mat(True), 'crystal_cold': crystal_mat(False), 'crystal_warm': crystal_mat(True)}
for o in CAVE:
    k = o.name.split('.')[0]
    mk = 'island' if k.startswith('island') else 'crystal_cold' if k == 'crystals_cold' else 'crystal_warm' if k == 'crystals_warm' else 'rock'
    o.data.materials.clear(); o.data.materials.append(MATS[mk])
    if k.startswith('crystals'):
        o.visible_shadow = True
print('мир: объектов', len(CAVE), flush=True)

# ---------------------------------------------------------------------
# Вода: тёмное зеркало с рябью и кругами (центры, радиусы, сила — из кадра)
# ---------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
water = bpy.context.active_object; water.name = 'water'
wm, g = new_mat('water'); water.data.materials.append(wm)
bs = g.node('ShaderNodeBsdfPrincipled'); g.link(bs.outputs[0], g.out().inputs['Surface'])
bs.inputs['Base Color'].default_value = (*lin('#020406'), 1); bs.inputs['Roughness'].default_value = 0.02; bs.inputs['IOR'].default_value = 1.33
geo = g.node('ShaderNodeNewGeometry'); P = geo.outputs['Position']
sp = g.node('ShaderNodeSeparateXYZ'); g.link(P, sp.inputs[0])
# мелкая рябь: шум, плывущий во времени (W — ключ кадра)
wn = g.node('ShaderNodeTexNoise'); wn.noise_dimensions = '4D'; wn.inputs['Scale'].default_value = 0.6; wn.inputs['Detail'].default_value = 3
g.link(P, wn.inputs['Vector']); WATER_W = wn.inputs['W']
height = g.math('MULTIPLY', wn.outputs['Fac'], 0.06)
RING_SOCKS = []
for i in range(6):   # круги: h += A·0,05·cos(2,4x)·exp(−0,4x²), x = (|p − c| − R)/0,09
    cx = g.node('ShaderNodeValue'); cy = g.node('ShaderNodeValue'); rr = g.node('ShaderNodeValue'); aa = g.node('ShaderNodeValue')
    RING_SOCKS.append((cx.outputs[0], cy.outputs[0], rr.outputs[0], aa.outputs[0]))
    dx = g.math('SUBTRACT', sp.outputs['X'], cx.outputs[0]); dy = g.math('SUBTRACT', sp.outputs['Y'], cy.outputs[0])
    d = g.math('SQRT', g.math('ADD', g.math('MULTIPLY', dx, dx), g.math('MULTIPLY', dy, dy)))
    x = g.math('DIVIDE', g.math('SUBTRACT', d, rr.outputs[0]), 0.09)
    w = g.math('MULTIPLY', g.math('COSINE', g.math('MULTIPLY', x, 2.4)), g.math('EXPONENT', g.math('MULTIPLY', g.math('MULTIPLY', x, x), -0.4)))
    height = g.math('ADD', height, g.math('MULTIPLY', w, g.math('MULTIPLY', aa.outputs[0], 0.05)))
bump = g.node('ShaderNodeBump'); bump.inputs['Distance'].default_value = 0.1; bump.inputs['Strength'].default_value = 1.0
g.link(height, bump.inputs['Height']); g.link(bump.outputs['Normal'], bs.inputs['Normal'])
add_fog(wm)

# ---------------------------------------------------------------------
# Небо: тёмный верх, светлая дымка у горизонта, пятно «луны»; для отражений и света —
# ещё светлые просветы в облаках (как карта окружения плеера)
# ---------------------------------------------------------------------
world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
wg = G(world.node_tree)
for n in list(wg.N):
    if n.type != 'OUTPUT_WORLD':
        wg.N.remove(n)
wout = next(n for n in wg.N if n.type == 'OUTPUT_WORLD')
tc = wg.node('ShaderNodeTexCoord'); D = wg.vmath('NORMALIZE', tc.outputs['Generated'])
sd = wg.node('ShaderNodeSeparateXYZ'); wg.link(D, sd.inputs[0])
y = sd.outputs['Z']                                         # «вверх» three.js
c = wg.mixc(lin(SKY['horizon']), lin(SKY['top']), wg.smooth(y, 0.0, 0.5))
c = wg.mixc(lin(SKY['below']), c, wg.smooth(y, -0.1, 0.0))
gx = wg.math('MULTIPLY', wg.math('ADD', sd.outputs['X'], 0.3), 2.2); gy = wg.math('MULTIPLY', wg.math('SUBTRACT', y, 0.42), 2.6)
moon = wg.math('MULTIPLY', wg.math('EXPONENT', wg.math('MULTIPLY', wg.math('ADD', wg.math('MULTIPLY', gx, gx), wg.math('MULTIPLY', gy, gy)), -1)),
               wg.math('GREATER_THAN', sd.outputs['Y'], -0.2))   # z three.js = −y Blender: «луна» — только позади
c = wg.mixc(c, wg.mixc((0.09, 0.11, 0.15), moon, 1.0, 'MULTIPLY'), 1.0, 'ADD')
# просветы (для света и бликов): гауссовы пятна по направлениям панелей карты окружения
spots = None
for dir3, col, k, s2 in (((-60, 110, -130), '#c8d8ff', 2.5, 0.0039), ((60, 40, 160), '#b4c4dc', 0.9, 0.0056),
                         ((-150, 30, 40), '#aab8cc', 0.7, 0.0045), ((0, 18, -200), '#9fb0c6', 0.8, 0.0038)):
    dv = v3(*dir3).normalized()
    dt = wg.vmath('DOT_PRODUCT', D, tuple(dv))
    wgt = wg.math('EXPONENT', wg.math('DIVIDE', wg.math('SUBTRACT', dt, 1.0), s2))
    term = wg.mixc(tuple(x * k for x in lin(col)), wgt, 1.0, 'MULTIPLY')
    spots = term if spots is None else wg.mixc(spots, term, 1.0, 'ADD')
lp = wg.node('ShaderNodeLightPath')
skyk = wg.node('ShaderNodeValue'); envk = wg.node('ShaderNodeValue')
cam_col = wg.mixc(c, skyk.outputs[0], 1.0, 'MULTIPLY')
env_col = wg.mixc(wg.mixc(c, spots, 1.0, 'ADD'), envk.outputs[0], 1.0, 'MULTIPLY')
fin = wg.mixc(env_col, cam_col, lp.outputs['Is Camera Ray'])
bg = wg.node('ShaderNodeBackground'); wg.link(fin, bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0
wg.link(bg.outputs[0], wout.inputs['Surface'])
SKY_K, ENV_K = skyk.outputs[0], envk.outputs[0]

# ---------------------------------------------------------------------
# Полосы тумана над водой: шумная светящаяся дымка (только для камеры и сквозь стекло)
# ---------------------------------------------------------------------
mm, g = new_mat('mist')
geo = g.node('ShaderNodeNewGeometry'); tcm = g.node('ShaderNodeTexCoord')
sp = g.node('ShaderNodeSeparateXYZ'); g.link(geo.outputs['Position'], sp.inputs[0])
su = g.node('ShaderNodeSeparateXYZ'); g.link(tcm.outputs['UV'], su.inputs[0])
mt = g.node('ShaderNodeValue'); MIST_T = mt.outputs[0]
px = g.math('ADD', g.math('MULTIPLY', sp.outputs['X'], 0.08), g.math('MULTIPLY', mt.outputs[0], 0.03))
py = g.math('SUBTRACT', g.math('MULTIPLY', sp.outputs['Z'], 0.35), g.math('MULTIPLY', sp.outputs['Y'], 0.02))
cmb = g.node('ShaderNodeCombineXYZ'); g.link(px, cmb.inputs[0]); g.link(py, cmb.inputs[1])
f = g.noise(cmb.outputs[0], 1.0, 2, 0.55)
a = g.math('MULTIPLY', g.smooth(f, 0.3, 0.85), g.math('SUBTRACT', 1.0, g.smooth(su.outputs['Y'], 0.0, 1.0)))
a = g.math('MULTIPLY', a, g.math('MULTIPLY', g.smooth(su.outputs['X'], 0.0, 0.2), g.math('SUBTRACT', 1.0, g.smooth(su.outputs['X'], 0.8, 1.0))))
ma = g.node('ShaderNodeValue'); MIST_A = ma.outputs[0]
em = g.node('ShaderNodeEmission'); em.inputs['Color'].default_value = (*lin('#8fa3bd'), 1)
g.link(g.math('MULTIPLY', a, ma.outputs[0]), em.inputs['Strength'])
tr = g.node('ShaderNodeBsdfTransparent'); ad = g.node('ShaderNodeAddShader')
g.link(tr.outputs[0], ad.inputs[0]); g.link(em.outputs[0], ad.inputs[1]); g.link(ad.outputs[0], g.out().inputs['Surface'])
for (x, z, w, h) in MIST:
    bpy.ops.mesh.primitive_plane_add(size=1, location=v3(x, h / 2, z), rotation=(math.pi / 2, 0, 0))
    o = bpy.context.active_object; o.name = 'mist'; o.scale = (w, h, 1); o.data.materials.append(mm)
    o.visible_diffuse = False; o.visible_glossy = False; o.visible_shadow = False; o.visible_volume_scatter = False

# ---------------------------------------------------------------------
# Шары-«спутники»: светятся сами (настоящие источники света), яркость — свойство k
# ---------------------------------------------------------------------
om, g = new_mat('orb')
bs = g.node('ShaderNodeBsdfPrincipled'); g.link(bs.outputs[0], g.out().inputs['Surface'])
bs.inputs['Base Color'].default_value = (*lin('#ff6a1a'), 1); bs.inputs['Roughness'].default_value = 0.18
bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.05
bs.inputs['Emission Color'].default_value = (*lin('#ff5a14'), 1)
at = g.node('ShaderNodeAttribute'); at.attribute_type = 'OBJECT'; at.attribute_name = 'k'
g.link(g.math('MULTIPLY', at.outputs['Fac'], ORB_L), bs.inputs['Emission Strength'])
ORBS = []
for i in range(9):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=1, location=(0, 0, -50))
    o = bpy.context.active_object; o.name = f'orb{i}'; o.data.materials.append(om)
    bpy.ops.object.shade_smooth()
    o['k'] = 0.0
    ORBS.append(o)
# капля в первом плане
bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.035, location=(0, 0, -50))
drop = bpy.context.active_object; drop.name = 'drop'; drop.scale = (1, 1, 1.6); bpy.ops.object.shade_smooth()
dm, g = new_mat('drop'); bs = g.node('ShaderNodeBsdfPrincipled'); g.link(bs.outputs[0], g.out().inputs['Surface'])
bs.inputs['Roughness'].default_value = 0.0; bs.inputs['IOR'].default_value = 1.33; bs.inputs['Transmission Weight'].default_value = 1.0
drop.data.materials.append(dm)

# ---------------------------------------------------------------------
# Свет
# ---------------------------------------------------------------------
def look_at(obj, target):
    d = (target - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, size, pos, target, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size; ld.color = lin(color); ld.energy = 0
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o)
    o.location = v3(*pos); look_at(o, v3(*target)); o.visible_camera = False
    return o

T0 = (0, 0.9, 0)
moon_l = area('moon', (14, 7), (-14, 26, -30), T0, '#c4d4ff')
rim_l = area('rim', (0.5, 5), (2.5, 3.4, -6.5), T0, '#d2e2ff')
sweep_l = area('sweep', (0.15, 2.4), (0, 1.5, 2), T0, '#ffffff')
kd = bpy.data.lights.new('key', 'SPOT'); kd.spot_blend = 0.7; kd.shadow_soft_size = 0.3; kd.color = lin('#eef2ff'); kd.energy = 0
key_l = bpy.data.objects.new('key', kd); sc.collection.objects.link(key_l); key_l.visible_camera = False
GLOWS = []
for i, p in enumerate(WARM_GLOW):
    gd = bpy.data.lights.new(f'glow{i}', 'POINT'); gd.shadow_soft_size = 0.2; gd.color = lin('#ff6a20'); gd.energy = 0
    go = bpy.data.objects.new(f'glow{i}', gd); sc.collection.objects.link(go); go.location = v3(*p); go.visible_camera = False
    GLOWS.append(go)

# вода не принимает прямой свет ламп: только отражения (как зеркало воды в плеере) —
# иначе блики полос и прожектора тянутся по ряби светящимися столбами
LAMPS = [moon_l, rim_l, sweep_l, key_l] + GLOWS
excl = bpy.data.collections.new('water_excluded')
excl.objects.link(water)
for l in (LAMPS if not os.environ.get('NOLINK') else []):
    l.light_linking.receiver_collection = excl
for co in excl.collection_objects:
    co.light_linking.link_state = 'EXCLUDE'

def set_frame(F):
    Lg = dict(F['light'])
    if os.environ.get('ONLY'):   # отладка: оставить один источник (key, moon, rim, glow, env)
        keep = os.environ['ONLY']
        for k in ('moon', 'rim', 'key', 'glow', 'env'):
            if k != keep:
                Lg[k] = 0
        Lg['crystal'] = 0; Lg['sweep'] = None
    moon_l.data.energy = Lg['moon'] * math.pi * 14 * 7
    rim_l.data.energy = Lg['rim'] * math.pi * 0.5 * 5
    ka = Lg.get('keyAt') or [0, 0.9, 0]
    key_l.location = v3(ka[0] + KEY_OFF[0], ka[1] + KEY_OFF[1], ka[2] + KEY_OFF[2]); look_at(key_l, v3(*ka))
    kd.spot_size = math.radians(2 * Lg.get('keyCone', 20)); kd.energy = Lg['key'] * 4 * math.pi
    for go in GLOWS:
        go.data.energy = Lg['glow'] * 4 * math.pi
    s = Lg.get('sweep')
    if s:
        sweep_l.data.size, sweep_l.data.size_y = s['w'], s['h']
        sweep_l.location = v3(*s['pos']); look_at(sweep_l, v3(*s['look']))
        sweep_l.data.energy = s['L'] * math.pi * s['w'] * s['h']
    else:
        sweep_l.data.energy = 0
    for sk in CRYSTAL_SOCKS:
        sk.default_value = WARM_EMIT * Lg.get('crystal', 1)
    for sk in FOG_SOCKS:
        sk.default_value = Lg.get('fog', 0.016)
    SKY_K.default_value = Lg['sky']; ENV_K.default_value = Lg['env']
    MIST_A.default_value = Lg['mist']; MIST_T.default_value = F['t']
    WATER_W.default_value = F['t'] * 0.25
    R = sorted(F['rings'], key=lambda q: -q[3])[:6]
    for i, socks in enumerate(RING_SOCKS):
        if i < len(R):
            x, z, rad, amp = R[i]
            socks[0].default_value, socks[1].default_value, socks[2].default_value, socks[3].default_value = x, -z, rad, amp
        else:
            socks[3].default_value = 0.0

# ---------------------------------------------------------------------
# Камера: кадр 2.39:1 — та же ширина поля зрения, что у 16:9 плеера; глубина резкости, смаз
# ---------------------------------------------------------------------
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.sensor_fit = 'HORIZONTAL'; cd.sensor_width = 24 * 16 / 9; cd.clip_start = 0.02; cd.clip_end = 400
cd.dof.use_dof = True; cd.dof.aperture_blades = 7; cd.dof.aperture_rotation = math.radians(12)

def key_matrix(o, M, f):
    o.matrix_world = M
    o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f); o.keyframe_insert('scale', frame=f)

for fi, F in enumerate(FR):
    f = fi + 1
    a_ = F['cam']['m']
    cam.matrix_world = C @ Matrix([[a_[c * 4 + r] for c in range(4)] for r in range(4)])
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
    cd.lens = 12.0 / math.tan(math.radians(F['cam']['fov']) / 2); cd.keyframe_insert('lens', frame=f)
    cd.dof.focus_distance = F['cam']['focus']; cd.dof.aperture_fstop = F['cam']['fstop'] / 10.0  # масштаб 1:10
    cd.dof.keyframe_insert('focus_distance', frame=f); cd.dof.keyframe_insert('aperture_fstop', frame=f)
    key_matrix(SHOE, m3(F['shoe']), f)
    for i, o in enumerate(ORBS):
        q = F['orbs'][i] if i < len(F['orbs']) else None
        o.hide_render = q is None; o.keyframe_insert('hide_render', frame=f)
        if q:
            o.location = v3(q[0], q[1], q[2]); o.scale = (q[3], q[3], q[3]); o['k'] = float(q[4])
        else:
            o.location = (0, 0, -50); o['k'] = 0.0
        o.keyframe_insert('location', frame=f); o.keyframe_insert('scale', frame=f); o.keyframe_insert('["k"]', frame=f)
    dq = F['drop']
    drop.hide_render = dq is None; drop.keyframe_insert('hide_render', frame=f)
    drop.location = v3(*dq) if dq else (0, 0, -50); drop.keyframe_insert('location', frame=f)

cuts = {i + 1 for i in range(1, len(FR)) if FR[i]['shot'] != FR[i - 1]['shot']}
for o in [cam, cd, SHOE, drop] + ORBS:
    ad = o.animation_data
    if not (ad and ad.action):
        continue
    for fc in ad.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT' if (int(round(kp.co[0])) + 1 in cuts or fc.data_path == 'hide_render') else 'LINEAR'

# ---------------------------------------------------------------------
# Настройки рендера: трассировка, денойз, AgX, свечение и дисторсия в композитинге
# ---------------------------------------------------------------------
W_, H_ = (int(v) for v in A.res.split('x'))
r = sc.render
r.resolution_x, r.resolution_y, r.resolution_percentage = W_, H_, 100
r.fps = 24
r.use_motion_blur = True; r.motion_blur_shutter = 0.5
r.use_persistent_data = True
for owner in (sc.render, sc.cycles):
    if hasattr(owner, 'motion_blur_position'):
        owner.motion_blur_position = 'START'
sc.cycles.samples = A.spp
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.035
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 10; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 4
sc.cycles.transmission_bounces = 8; sc.cycles.transparent_max_bounces = 12; sc.cycles.volume_bounces = 0
sc.cycles.sample_clamp_indirect = 5; sc.cycles.blur_glossy = 1.0
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
sc.view_settings.exposure = 0.3
r.image_settings.file_format = 'PNG'; r.image_settings.color_depth = '8'
sc.use_nodes = True
ct = sc.node_tree
for n in list(ct.nodes):
    ct.nodes.remove(n)
rl = ct.nodes.new('CompositorNodeRLayers')
gl = ct.nodes.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'; gl.threshold = 1.0; gl.size = 7
try:
    gl.mix = -0.55
except Exception:
    pass
ld_ = ct.nodes.new('CompositorNodeLensdist'); ld_.inputs['Distortion'].default_value = -0.012; ld_.inputs['Dispersion'].default_value = 0.012
co = ct.nodes.new('CompositorNodeComposite')
ct.links.new(rl.outputs['Image'], gl.inputs['Image']); ct.links.new(gl.outputs['Image'], ld_.inputs['Image']); ct.links.new(ld_.outputs['Image'], co.inputs['Image'])

if A.save:
    sc.frame_set(1); set_frame(FR[0])
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(A.save))

# ---------------------------------------------------------------------
os.makedirs(A.out, exist_ok=True)
a, b, *st = (int(v) for v in A.frames.split(':'))
todo = [int(v) for v in A.only.split(',')] if A.only else list(range(a, min(b, len(FR)), st[0] if st else 1))
for fi in todo:
    path = os.path.join(A.out, f'f{fi:04d}.png')
    if os.path.exists(path) and not A.only:
        continue
    t0 = time.time()
    sc.frame_set(fi + 1)
    set_frame(FR[fi])
    r.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    print(f'КАДР {fi} ({FR[fi]["shot"]}) {time.time() - t0:.1f} с', flush=True)
