"""Рендер монтажа v5 в Blender Cycles (трассировка лучей).

Сцену собирает этот скрипт: кроссовки, машина и камешки — из GLB, которые выгрузил
three.js (tools/export-cycles.cjs), движение — из frames.json, всё остальное
(мокрый асфальт с лужами и рябью, город, свет, дождь, брызги) — здесь.

    python3 cycles/render.py --data out/cycles --out out/cycles/frames \
        --res 1280x720 --spp 48 --frames 0:625[:шаг] [--only 288,300]

Единицы: 1 = 10 см, как в three.js. Ось Y three.js → ось Z Blender.
"""
import argparse, json, math, os, sys, time
import numpy as np
import bpy
from mathutils import Matrix, Vector

ap = argparse.ArgumentParser()
ap.add_argument('--data', default='out/cycles')
ap.add_argument('--out', default='out/cycles/frames')
ap.add_argument('--res', default='1280x720')
ap.add_argument('--spp', type=int, default=48)
ap.add_argument('--frames', default='0:625')
ap.add_argument('--only', default='')
ap.add_argument('--hdr', default='assets/shanghai_bund_2k.hdr')
ap.add_argument('--save', default='')
A = ap.parse_args()
DATA = json.load(open(os.path.join(A.data, 'frames.json')))
FR = DATA['frames']
BG_YAW = 2.95  # как в street.js

# three.js (Y вверх) → Blender (Z вверх)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()
def m3(a):  # матрица three.js (по столбцам) → Blender
    M = Matrix([[a[c * 4 + r] for c in range(4)] for r in range(4)])
    return C @ M @ CI
def v3(x, y, z):
    return Vector((x, -z, y))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'

# ---------------------------------------------------------------------
# Кроссовки и камешки из three.js
# ---------------------------------------------------------------------
def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

shoes = {}
for cw in ('ember', 'glacier', 'volt'):
    objs = import_glb(os.path.join(A.data, f'shoe_{cw}.glb'))
    root = next(o for o in objs if o.name.startswith('shoe_' + cw))
    groups = {o.name.split('_', 1)[1].split('.')[0]: o for o in objs if o.name.startswith(cw + '_')}
    shoes[cw] = {'root': root, 'groups': groups, 'objs': objs}
debris = import_glb(os.path.join(A.data, 'debris.glb'))

def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None

def water_material(name='water'):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = principled(m)
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Roughness'].default_value = 0.0
    b.inputs['IOR'].default_value = 1.333
    b.inputs['Transmission Weight'].default_value = 1.0
    return m
WATER = water_material()

# материалы из glTF в целом верны; доводим то, что glTF не умеет описать
for cw, s in shoes.items():
    for o in s['objs']:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m:
                continue
            base = m.name.split('.')[0]
            b = principled(m)
            if base == 'drop':                                  # капли — настоящая вода с преломлением
                slot.material = WATER
            elif b is None:
                continue
            elif base == 'upper':                                # мокрый трикотаж: ворс, чуть глаже
                b.inputs['Sheen Weight'].default_value = 0.45
                b.inputs['Sheen Roughness'].default_value = 0.55
            elif base in ('foamTop', 'foamBottom'):              # пена пропускает свет
                b.inputs['Subsurface Weight'].default_value = 0.25
                b.inputs['Subsurface Radius'].default_value = (1.0, 0.75, 0.55)
                b.inputs['Subsurface Scale'].default_value = 0.08
        if 'drop' in o.name.lower() or o.name.lower().startswith('drops') or 'foamdrops' in o.name.lower():
            o.visible_shadow = False

# ---------------------------------------------------------------------
# Узлы: маленький помощник
# ---------------------------------------------------------------------
class NB:
    def __init__(self, tree):
        self.t, self.N, self.L = tree, tree.nodes, tree.links
    def n(self, kind, **kw):
        node = self.N.new(kind)
        for k, v in kw.items():
            if k.startswith('_'):
                setattr(node, k[1:], v)
            else:
                self.inp(node, k, v)
        return node
    def inp(self, node, key, v):
        sock = node.inputs[key] if isinstance(key, int) else node.inputs[key.replace('__', ' ')]
        if hasattr(v, 'bl_idname') or isinstance(v, bpy.types.NodeSocket):
            if isinstance(v, bpy.types.NodeSocket):
                out = v
            else:  # у узла Mix четыре выхода «Result» — берём включённый и подходящий по типу
                outs = [o for o in v.outputs if o.enabled] or list(v.outputs)
                out = next((o for o in outs if o.type == sock.type), outs[0])
            self.L.new(out, sock)
        else:
            sock.default_value = v
    def math(self, op, a, b=0.0, clamp=False):
        node = self.n('ShaderNodeMath', _operation=op, _use_clamp=clamp)
        self.inp(node, 0, a); self.inp(node, 1, b)
        return node
    def smooth(self, x, a, b):
        return self.n('ShaderNodeMapRange', _interpolation_type='SMOOTHSTEP', Value=x, From__Min=a, From__Max=b)
    def mix(self, a, b, f):  # float
        return self.n('ShaderNodeMix', _data_type='FLOAT', Factor=f, A=a, B=b)
    def mixc(self, a, b, f):
        node = self.n('ShaderNodeMix', _data_type='RGBA', Factor=f)
        self.inp(node, 6, a); self.inp(node, 7, b)
        return node

def value_node(nb, name, v=0.0):
    node = nb.n('ShaderNodeValue'); node.name = name; node.label = name
    node.outputs[0].default_value = v
    return node

# ---------------------------------------------------------------------
# Мокрый асфальт: скан, лужи во впадинах, плёнка воды (слой Coat), рябь от капель
# ---------------------------------------------------------------------
def load_img(path, color=True):
    img = bpy.data.images.load(os.path.abspath(path))
    img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    return img

bpy.ops.mesh.primitive_plane_add(size=260, location=(0, 0, 0))
ground = bpy.context.active_object; ground.name = 'asphalt'
gm = bpy.data.materials.new('asphalt'); gm.use_nodes = True; ground.data.materials.append(gm)
nb = NB(gm.node_tree)
for n in list(nb.N):
    if n.type != 'OUTPUT_MATERIAL':
        nb.N.remove(n)
out = next(n for n in nb.N if n.type == 'OUTPUT_MATERIAL')
tc = nb.n('ShaderNodeTexCoord')
sep = nb.n('ShaderNodeSeparateXYZ', Vector=tc.outputs['Object'])
X = sep.outputs['X']
Zt = nb.math('MULTIPLY', sep.outputs['Y'], -1.0)            # z в системе three.js
uvA = nb.n('ShaderNodeMapping', Vector=tc.outputs['Object'], Scale=(1 / 15, 1 / 15, 1))
uvD = nb.n('ShaderNodeMapping', Vector=tc.outputs['Object'], Scale=(4 / 15, 4 / 15, 1), Location=(0.5, 0.5, 0))
uvB = nb.n('ShaderNodeMapping', Vector=tc.outputs['Object'], Scale=(0.0123, 0.0123, 1), Location=(0.37, 0.37, 0))
col = nb.n('ShaderNodeTexImage', Vector=uvA); col.image = load_img('assets/asphalt_color.jpg')
nor = nb.n('ShaderNodeTexImage', Vector=uvA); nor.image = load_img('assets/asphalt_normal.jpg', False)
norD = nb.n('ShaderNodeTexImage', Vector=uvD); norD.image = nor.image
rd = nb.n('ShaderNodeTexImage', Vector=uvA); rd.image = load_img('assets/asphalt_rd.jpg', False)
rdB = nb.n('ShaderNodeTexImage', Vector=uvB); rdB.image = rd.image
rdS = nb.n('ShaderNodeSeparateColor', Color=rd.outputs['Color'])
H = rdS.outputs['Green']; ROUGH = rdS.outputs['Red']
big = nb.n('ShaderNodeSeparateColor', Color=rdB.outputs['Color']).outputs['Green']
# лужа вокруг кроссовка: exp(-r²/7.5)
dx = nb.math('SUBTRACT', X, 0.2); dz = nb.math('SUBTRACT', Zt, 0.15)
r2 = nb.math('ADD', nb.math('MULTIPLY', dx, dx), nb.math('MULTIPLY', dz, dz))
nearP = nb.math('EXPONENT', nb.math('MULTIPLY', r2, -1 / 7.5))
level = nb.math('ADD', nb.math('ADD', nb.math('MULTIPLY', nb.math('SUBTRACT', big, 0.62), 0.5), 0.33), nb.math('MULTIPLY', nearP, 0.38))
water = nb.smooth(nb.math('SUBTRACT', level, H), 0.0, 0.04)
# стёртая разметка: полоса у z = -2.9, краска на выступах
band = nb.math('SUBTRACT', 1.0, nb.smooth(nb.math('ABSOLUTE', nb.math('ADD', Zt, 2.9)), 0.55, 0.62))
paint = nb.math('MULTIPLY', nb.math('MULTIPLY', band, nb.smooth(H, 0.5, 0.62)), nb.math('SUBTRACT', 1.0, water))
dry = nb.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0); nb.inp(dry, 6, col); dry.inputs[7].default_value = (0.36, 0.36, 0.36, 1)
wet = nb.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0); nb.inp(wet, 6, col); wet.inputs[7].default_value = (0.2, 0.2, 0.2, 1)
baseC = nb.mixc(dry, wet, water)
paintC = nb.mixc(baseC, (0.5, 0.5, 0.48, 1), paint)
# нормали асфальта (крупная + мелкая), гаснут под водой
nmA = nb.n('ShaderNodeNormalMap', Color=nor.outputs['Color'], Strength=nb.math('SUBTRACT', 1.0, nb.math('MULTIPLY', water, 0.92)))
# рябь: три слоя ячеек Вороного, в каждой капля падает в своё время
RAIN_T = value_node(nb, 'rainT')
RAIN_A = value_node(nb, 'rainAmt', 1.0)
height = None
for L, scale in enumerate((3.2, 5.1, 7.0)):
    vco = nb.n('ShaderNodeMapping', Vector=tc.outputs['Object'], Location=(L * 17.31, L * 9.7, 0))
    vor = nb.n('ShaderNodeTexVoronoi', Vector=vco, Scale=scale, Randomness=0.85)
    rc = nb.n('ShaderNodeSeparateColor', Color=vor.outputs['Color'])
    per = nb.math('ADD', nb.math('MULTIPLY', rc.outputs['Green'], 0.5), 0.9)
    age = nb.math('FRACT', nb.math('ADD', nb.math('DIVIDE', RAIN_T, per), rc.outputs['Red']))
    d = nb.math('MULTIPLY', vor.outputs['Distance'], 1.0)
    x = nb.math('MULTIPLY', nb.math('SUBTRACT', d, nb.math('MULTIPLY', age, 0.55)), 14.0)
    env = nb.math('MULTIPLY', nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('MULTIPLY', x, x), -0.35)), nb.math('POWER', nb.math('SUBTRACT', 1.0, age), 2.0))
    hL = nb.math('MULTIPLY', nb.math('SINE', nb.math('MULTIPLY', x, 2.2)), env)
    height = hL if height is None else nb.math('ADD', height, hL)
height = nb.math('MULTIPLY', height, RAIN_A)
# волны от ударов и капель: 8 «слотов» (центр, радиус, сила) обновляются покадрово
RINGS = []
for i in range(8):
    cx, cz, rr, amp = (value_node(nb, f'ring{i}_{k}', v) for k, v in (('x', 0), ('z', 0), ('r', 0), ('a', 0)))
    ddx = nb.math('SUBTRACT', X, cx); ddz = nb.math('SUBTRACT', Zt, cz)
    dd = nb.math('SQRT', nb.math('ADD', nb.math('MULTIPLY', ddx, ddx), nb.math('MULTIPLY', ddz, ddz)))
    xr = nb.math('DIVIDE', nb.math('SUBTRACT', dd, rr), 0.07)
    hr = nb.math('MULTIPLY', nb.math('MULTIPLY', nb.math('SINE', nb.math('MULTIPLY', xr, 2.6)), nb.math('EXPONENT', nb.math('MULTIPLY', nb.math('MULTIPLY', xr, xr), -0.5))), amp)
    height = nb.math('ADD', height, hr)
    RINGS.append((cx, cz, rr, amp))
coatH = nb.math('MULTIPLY', height, nb.math('ADD', 0.25, nb.math('MULTIPLY', water, 0.75)))
bump = nb.n('ShaderNodeBump', Strength=0.35, Distance=0.004, Height=coatH)
bsdf = nb.n('ShaderNodeBsdfPrincipled')
nb.inp(bsdf, 'Base Color', paintC)
nb.inp(bsdf, 'Roughness', nb.mix(nb.math('ADD', nb.math('MULTIPLY', ROUGH, 0.35), 0.45), 0.35, water))
nb.inp(bsdf, 'Normal', nmA)
nb.inp(bsdf, 'Coat Weight', nb.mix(0.55, 1.0, water))           # плёнка воды
nb.inp(bsdf, 'Coat Roughness', nb.mix(0.16, 0.0, water))
bsdf.inputs['Coat IOR'].default_value = 1.333
nb.inp(bsdf, 'Coat Normal', bump)
nb.L.new(bsdf.outputs[0], out.inputs['Surface'])
RAIN_T_NODE, RAIN_A_NODE = RAIN_T, RAIN_A

# ---------------------------------------------------------------------
# Город: панорама Shanghai Bund (фон, отражения и боке — от настоящей оптики камеры)
# ---------------------------------------------------------------------
world = bpy.data.worlds.new('city'); sc.world = world; world.use_nodes = True
wn = NB(world.node_tree)
for n in list(wn.N):
    if n.type != 'OUTPUT_WORLD':
        wn.N.remove(n)
wout = next(n for n in wn.N if n.type == 'OUTPUT_WORLD')
wtc = wn.n('ShaderNodeTexCoord')
# у панорамы в Blender та же точка отсчёта, что в three.js; поворот фона — как BG_YAW в street.js
wmap = wn.n('ShaderNodeMapping', Vector=wtc.outputs['Generated'], Rotation=(0, 0, -BG_YAW))
env = wn.n('ShaderNodeTexEnvironment', Vector=wmap); env.image = bpy.data.images.load(os.path.abspath(A.hdr))
wsep = wn.n('ShaderNodeSeparateXYZ', Vector=wtc.outputs['Generated'])
below = wn.n('ShaderNodeMapRange', Value=wsep.outputs['Z'], From__Min=-0.12, From__Max=0.0, To__Min=0.3, To__Max=1.0)
envc = wn.n('ShaderNodeMix', _data_type='RGBA', _blend_type='MULTIPLY', Factor=1.0); wn.inp(envc, 6, env); wn.inp(envc, 7, below)
bg = wn.n('ShaderNodeBackground', Color=envc, Strength=0.35)
wn.L.new(bg.outputs[0], wout.inputs['Surface'])
WORLD_STRENGTH = bg.inputs['Strength']

# ---------------------------------------------------------------------
# Свет — только то, что светит на ночной улице
# ---------------------------------------------------------------------
def look_at(obj, target):
    d = (target - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, pos, target, size, color, power, shape='RECTANGLE'):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = shape
    ld.size, ld.size_y = size; ld.color = color; ld.energy = power
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o)
    o.location = pos; look_at(o, target)
    return o

TGT = v3(0, 0.4, 0)
win = area('window', v3(2.8, 2.6, 6.8), TGT, (6, 4), (1.0, 0.86, 0.72), 900)          # витрина: тёплый мягкий ключ
lamp_d = bpy.data.lights.new('lamp', 'SPOT'); lamp_d.spot_size = math.radians(55); lamp_d.spot_blend = 0.6
lamp_d.shadow_soft_size = 1.2; lamp_d.color = (1.0, 0.68, 0.36); lamp_d.energy = 60000
lamp = bpy.data.objects.new('lamp', lamp_d); sc.collection.objects.link(lamp)
lamp.location = v3(-4, 30, -15); look_at(lamp, v3(0, 0, 0))                              # фонарь: натрий сзади сверху
neon1 = area('neon_pink', v3(-6.8, 2.2, 3.4), TGT, (8, 0.35), (1.0, 0.25, 0.62), 260)
neon2 = area('neon_cyan', v3(-6.5, 3.0, 4.2), TGT, (6, 0.3), (0.25, 0.85, 1.0), 160)
sun_d = bpy.data.lights.new('lightning', 'SUN'); sun_d.angle = math.radians(8); sun_d.color = (0.8, 0.86, 1.0); sun_d.energy = 0
sky = bpy.data.objects.new('lightning', sun_d); sc.collection.objects.link(sky)
sky.rotation_euler = (math.radians(35), math.radians(10), math.radians(-30))

# машина за кроссовком: кузов, стёкла, колёса, фары и фонари — модель из three.js (js/car.js);
# свет фар — два прожектора чуть впереди носа, светят вперёд по ходу и немного вбок
CAR_NOSE, CAR_HEAD = 22.4, (23.6, 6.9, 5.0)   # как CAR.nose и HEAD_LIGHT в car.js
CAR_ROOT, CAR_EM = None, {}
if os.path.exists(os.path.join(A.data, 'car.glb')):
    car_objs = import_glb(os.path.join(A.data, 'car.glb'))
    CAR_ROOT = next(o for o in car_objs if o.name.split('.')[0] == 'car')
    for o in car_objs:
        if o.type != 'MESH':
            continue
        for slot in o.material_slots:
            m = slot.material; b_ = principled(m)
            if not b_:
                continue
            base = m.name.split('.')[0]
            if base == 'car_paint':                              # металлик под лаком
                b_.inputs['Metallic'].default_value = 0.55; b_.inputs['Roughness'].default_value = 0.32
                b_.inputs['Coat Weight'].default_value = 1.0; b_.inputs['Coat Roughness'].default_value = 0.03
            elif base == 'car_glass':                            # тонированное стекло: чёрное зеркало
                b_.inputs['Base Color'].default_value = (0.002, 0.002, 0.003, 1); b_.inputs['Roughness'].default_value = 0.02
                b_.inputs['Coat Weight'].default_value = 1.0; b_.inputs['Coat Roughness'].default_value = 0.0
            elif base in ('car_head', 'car_tail'):
                b_.inputs['Base Color'].default_value = (0, 0, 0, 1)
                b_.inputs['Emission Color'].default_value = (1, 0.95, 0.88, 1) if base == 'car_head' else (1, 0.09, 0.03, 1)
                CAR_EM[base] = b_.inputs['Emission Strength']
car = {'spots': []}
for o_ in (1, -1):
    sd = bpy.data.lights.new('head', 'SPOT'); sd.spot_size = math.radians(100); sd.spot_blend = 0.9; sd.shadow_soft_size = 0.6; sd.color = (1, 0.93, 0.82)
    so = bpy.data.objects.new('head', sd); sc.collection.objects.link(so); car['spots'].append(so)

def car_matrix(c):
    """мировая матрица машины в осях three.js: нос по ходу движения, фары там же, где в плеере"""
    if c['on'] <= 0:
        return Matrix.Translation((0, -400, 0))                # машины нет в кадре — под землёй
    xh = c['dir'] * (c['p'] * 130 - 65) * 1.3
    return Matrix.Translation((xh - c['dir'] * CAR_NOSE, 0, -48)) @ Matrix.Rotation(0 if c['dir'] > 0 else math.pi, 4, 'Y')

# ---------------------------------------------------------------------
# Дождь: тонкие водяные нити (стекло n = 1,33) — видны, только когда за ними свет,
# как настоящий дождь ночью. Брызги и капли — водяные сферы. Пересобираются покадрово.
# ---------------------------------------------------------------------
NR = 3200
rs = np.random.default_rng(404)
RAIN_SEED = rs.random((NR, 4))
def tube_template(sides=6):
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    ring = np.stack([np.cos(ang), np.sin(ang)], 1)
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, j, sides + j, sides + i))
    return ring, faces
RING, TFACES = tube_template()

def make_dyn(name, mat):
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    me.materials.append(mat)
    o.visible_shadow = False; o.visible_diffuse = False
    try:
        o.cycles.use_motion_blur = False
    except Exception:
        pass
    return o
rain_obj = make_dyn('rain', WATER)
spl_obj = make_dyn('splash', WATER)

def set_mesh(o, verts, faces):
    me = o.data
    me.clear_geometry()
    if len(verts):
        me.from_pydata(verts.tolist() if hasattr(verts, 'tolist') else verts, [], faces)
    me.update()

def rain_mesh(F):
    n = int(NR * F['rain'])
    if n == 0:
        return np.zeros((0, 3)), []
    s = RAIN_SEED[:n]
    cam = F['cam']['m']; tx, tz = cam[12] * 0.6, cam[14] * 0.6
    H = 12.0
    y = np.mod(s[:, 2] * 12 - F['rainT'] * 26 * (0.85 + 0.3 * s[:, 3]), H)
    cx = tx + (s[:, 0] * 2 - 1) * 7; cz = tz + (s[:, 1] * 2 - 1) * 7
    L = 0.34 * (0.7 + 0.6 * s[:, 3]); r = 0.0011
    dirv = np.array([0.07, -1.0, 0.025]); dirv /= np.linalg.norm(dirv)
    a = np.stack([cx, y, cz], 1); b = a + dirv[None, :] * L[:, None]
    # перпендикуляры к направлению струи
    u = np.array([1.0, 0.07, 0]); u -= dirv * u.dot(dirv); u /= np.linalg.norm(u); w = np.cross(dirv, u)
    off = (RING[:, 0:1] * u[None, :] + RING[:, 1:2] * w[None, :]) * r
    V = np.concatenate([a[:, None, :] + off[None], b[:, None, :] + off[None]], 1)  # n × 12 × 3 (three.js)
    V = V.reshape(-1, 3)[:, [0, 2, 1]] * np.array([1, -1, 1])                       # → Blender
    faces = [tuple(i * 12 + k for k in f) for i in range(n) for f in TFACES]
    return V, faces

ICO_V = None
def sphere_mesh(parts):
    global ICO_V
    if ICO_V is None:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        t = bpy.context.active_object
        ICO_V = (np.array([v.co[:] for v in t.data.vertices]), [tuple(p.vertices) for p in t.data.polygons])
        bpy.data.objects.remove(t)
    iv, ifc = ICO_V
    if not parts:
        return np.zeros((0, 3)), []
    Vs, Fs = [], []
    for k, p in enumerate(parts):
        x, y, z, rad, vx, vy, vz = p
        vel = np.array([vx, vy, vz]); sp = np.linalg.norm(vel)
        d = vel / sp if sp > 1e-6 else np.array([0, 1.0, 0])
        stretch = 1 + sp * 0.012
        # вытягиваем каплю вдоль скорости (в системе three.js)
        pts = iv[:, [0, 2, 1]] * np.array([1, 1, -1]) * rad   # шаблон в осях three.js
        along = pts @ d
        pts = pts + np.outer(along * (stretch - 1), d)
        pts = pts + np.array([x, y, z])
        Vs.append(pts[:, [0, 2, 1]] * np.array([1, -1, 1]))
        Fs.extend(tuple(i + k * len(iv) for i in f) for f in ifc)
    return np.concatenate(Vs), Fs

# ---------------------------------------------------------------------
# Камера: настоящая оптика — глубина резкости (7 лепестков диафрагмы), смаз затвором 180°
# ---------------------------------------------------------------------
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24; cd.clip_start = 0.02; cd.clip_end = 600
cd.dof.use_dof = True; cd.dof.aperture_blades = 7; cd.dof.aperture_rotation = math.radians(12)

# ---------------------------------------------------------------------
# Ключи анимации: камера, кроссовок и его части, лайнап — для смаза движения
# ---------------------------------------------------------------------
LINEUP = {'glacier': (0.5, 1.85), 'volt': (-0.5, -1.85)}
rest = DATA['meta']['rest']
def key_matrix(o, M, f):
    o.matrix_world = M
    o.keyframe_insert('location', frame=f); o.keyframe_insert('rotation_euler', frame=f); o.keyframe_insert('scale', frame=f)

for fi, F in enumerate(FR):
    f = fi + 1
    # у камеры свои оси одинаковы в three.js и Blender (смотрит по −Z, верх +Y): переводим только мир
    a_ = F['cam']['m']
    cam.matrix_world = C @ Matrix([[a_[c * 4 + r] for c in range(4)] for r in range(4)])
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_euler', frame=f)
    cd.lens = 12.0 / math.tan(math.radians(F['cam']['fov']) / 2)
    cd.keyframe_insert('lens', frame=f)
    cd.dof.focus_distance = F['cam']['focus']
    cd.dof.aperture_fstop = F['cam']['fstop'] / 10.0   # сцена в масштабе 1:10 → диафрагма как у реального объектива
    cd.dof.keyframe_insert('focus_distance', frame=f); cd.dof.keyframe_insert('aperture_fstop', frame=f)
    e = shoes['ember']
    key_matrix(e['root'], m3(F['shoe']), f)
    for k, g in e['groups'].items():
        if k in F['groups']:
            key_matrix(g, m3(F['groups'][k]), f)
    for cw, (dx_, dz_) in LINEUP.items():
        r = shoes[cw]['root']
        r.matrix_world = Matrix.Translation(v3(rest['pos'][0] + dx_, rest['pos'][1] + 0.024, dz_))
        r.keyframe_insert('location', frame=f)
    if CAR_ROOT:
        key_matrix(CAR_ROOT, C @ car_matrix(F['car']) @ CI, f)
# ключи — ступенчатые там, где нужна склейка (камера перескакивает между планами)
for o in [cam, cd] + [shoes['ember']['root']] + list(shoes['ember']['groups'].values()) + ([CAR_ROOT] if CAR_ROOT else []):
    ad = o.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
cuts = {i + 1 for i in range(1, len(FR)) if FR[i]['shot'] != FR[i - 1]['shot']}
for o in [cam, cd, shoes['ember']['root']] + list(shoes['ember']['groups'].values()) + ([CAR_ROOT] if CAR_ROOT else []):
    if not (o.animation_data and o.animation_data.action):
        continue
    for fc in o.animation_data.action.fcurves:
        for kp in fc.keyframe_points:
            if int(round(kp.co[0])) + 1 in cuts:
                kp.interpolation = 'CONSTANT'

# ---------------------------------------------------------------------
# Покадровые изменения, которые не ключуются: свет, дождь, брызги, волны
# ---------------------------------------------------------------------
def autofocus(F):
    # как фокус-пуллер: луч из центра кадра до ближайшей поверхности
    if not F['cam'].get('af'):
        return
    # дождь, брызги и спрятанные кроссовки не должны «ловить» фокус
    hidden = [rain_obj, spl_obj] + [o for cw in LINEUP for o in shoes[cw]['objs'] if o.hide_render]
    for o in hidden:
        o.hide_viewport = True
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    o = cam.matrix_world.translation; d = cam.matrix_world.to_3x3() @ Vector((0, 0, -1))
    hit, loc, *_ = sc.ray_cast(dg, o, d, distance=50)
    for h in hidden:
        h.hide_viewport = False
    if hit:
        cd.dof.focus_distance = (loc - o).length * F['cam']['af']

def apply_frame(F):
    vis = F['lineup'] > 0.5
    for cw in LINEUP:
        for o in shoes[cw]['objs']:
            o.hide_render = not vis
    L = F['light']
    win.data.energy = 150 * L['window']
    lamp.data.energy = 8000 * L['lamp']
    neon1.data.energy = 120 * L['neon']; neon2.data.energy = 80 * L['neon']
    sky.data.energy = 3 * L['lightning']
    WORLD_STRENGTH.default_value = 0.17 * L['env'] * (1 + 5 * L['lightning'])
    c = F['car']
    on = c['on'] > 0
    Mc = car_matrix(c)
    for i, s_ in enumerate((1, -1)):
        sp = car['spots'][i]
        p = Mc @ Vector((CAR_HEAD[0], CAR_HEAD[1], s_ * CAR_HEAD[2]))   # в осях three.js
        sp.location = v3(p.x, p.y, p.z); look_at(sp, v3(p.x + c['dir'] * 30, 0.5, p.z + 6))
        sp.data.energy = 6000 if on else 0
    if 'car_head' in CAR_EM:
        CAR_EM['car_head'].default_value = 35 if on else 0
        CAR_EM['car_tail'].default_value = 14 if on else 0
    RAIN_T_NODE.outputs[0].default_value = F['rainT']
    RAIN_A_NODE.outputs[0].default_value = F['rain']
    rings = sorted(F['rings'], key=lambda r: r[2])[:8]
    for i, (cx, cz, rr, amp) in enumerate(RINGS):
        if i < len(rings):
            x0, z0, age, pw = rings[i]
            cx.outputs[0].default_value = x0; cz.outputs[0].default_value = z0
            rr.outputs[0].default_value = 0.12 + 2.4 * age
            amp.outputs[0].default_value = pw * math.exp(-age * 1.4) * 0.9
        else:
            amp.outputs[0].default_value = 0
    V, Fc = rain_mesh(F); set_mesh(rain_obj, V, Fc)
    V, Fc = sphere_mesh(F['splash'] + F['drops']); set_mesh(spl_obj, V, Fc)

# ---------------------------------------------------------------------
# Настройки рендера: трассировка, денойз, цвет как у кинокамеры (AgX)
# ---------------------------------------------------------------------
W_, H_ = (int(v) for v in A.res.split('x'))
r = sc.render
r.resolution_x, r.resolution_y, r.resolution_percentage = W_, H_, 100
r.fps = 24
r.use_motion_blur = True; r.motion_blur_shutter = 0.5
r.use_persistent_data = True  # неподвижное не пересобирается каждый кадр
for owner in (sc.render, sc.cycles):
    if hasattr(owner, 'motion_blur_position'):
        owner.motion_blur_position = 'START'
sc.cycles.samples = A.spp
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.05
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 8; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 4
sc.cycles.transmission_bounces = 8; sc.cycles.transparent_max_bounces = 8; sc.cycles.volume_bounces = 0
sc.cycles.sample_clamp_indirect = 8; sc.cycles.blur_glossy = 0.6
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = True
sc.view_settings.view_transform = 'AgX'
try:
    sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
sc.view_settings.exposure = 0.3
r.image_settings.file_format = 'PNG'; r.image_settings.color_depth = '8'
# композитинг: мягкое свечение вокруг бликов (как ореол на плёнке) и чуть-чуть дисторсии объектива
sc.use_nodes = True
ct = sc.node_tree
for n in list(ct.nodes):
    ct.nodes.remove(n)
rl = ct.nodes.new('CompositorNodeRLayers')
gl = ct.nodes.new('CompositorNodeGlare'); gl.glare_type = 'FOG_GLOW'; gl.threshold = 1.2; gl.size = 7
try:
    gl.mix = -0.6
except Exception:
    pass
ld_ = ct.nodes.new('CompositorNodeLensdist'); ld_.inputs['Distortion'].default_value = -0.012; ld_.inputs['Dispersion'].default_value = 0.012
co = ct.nodes.new('CompositorNodeComposite')
ct.links.new(rl.outputs['Image'], gl.inputs['Image']); ct.links.new(gl.outputs['Image'], ld_.inputs['Image']); ct.links.new(ld_.outputs['Image'], co.inputs['Image'])

if A.save:
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
    apply_frame(FR[fi])
    autofocus(FR[fi])
    r.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    print(f'КАДР {fi} ({FR[fi]["shot"]}) {time.time() - t0:.1f} с', flush=True)
