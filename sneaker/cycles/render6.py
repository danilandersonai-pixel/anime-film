"""Рендер v6 «Анатомия» в Blender Cycles: тёмная студия, разбор на детали, шнуровка.

Кроссовок, разобранный на детали, — из GLB, который выгрузил three.js
(tools/export-cycles6.cjs), движение, шнуровка и свет — из frames6.json;
студия (чёрный глянцевый пол, софтбокс, контровые, бегущая полоса, прожектор) — здесь.

    python3 cycles/render6.py --data out/cycles6 --out out/cycles6/frames \
        --res 1280x720 --spp 16 --frames 0:721[:шаг] [--only 120,300]

Единицы: 1 = 10 см, как в three.js. Ось Y three.js → ось Z Blender.
Свет — в единицах three.js-плеера: площадной — яркость L (Вт = L·π·S), прожектор — сила I (Вт = I·4π).
"""
import argparse, json, math, os, time
import bpy
from mathutils import Matrix, Vector

ap = argparse.ArgumentParser()
ap.add_argument('--data', default='out/cycles6')
ap.add_argument('--out', default='out/cycles6/frames')
ap.add_argument('--res', default='1280x720')
ap.add_argument('--spp', type=int, default=16)
ap.add_argument('--frames', default='0:721')
ap.add_argument('--only', default='')
ap.add_argument('--save', default='')
A = ap.parse_args()
DATA = json.load(open(os.path.join(A.data, 'frames6.json')))
FR = DATA['frames']

# three.js (Y вверх) → Blender (Z вверх)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()
def m3(a):  # матрица three.js (по столбцам) → Blender
    M = Matrix([[a[c * 4 + r] for c in range(4)] for r in range(4)])
    return C @ M @ CI
def v3(x, y, z):
    return Vector((x, -z, y))
def lin(hexs):  # sRGB → линейный цвет света
    c = [int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'

# ---------------------------------------------------------------------
# Кроссовок по деталям
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
bpy.ops.import_scene.gltf(filepath=os.path.join(A.data, 'shoe_parts.glb'))
OBJS = [o for o in bpy.data.objects if o not in before]
fix_lining(OBJS)
base = lambda o: o.name.split('.')[0]
PARTS = {base(o)[5:]: o for o in OBJS if base(o).startswith('part_')}
SEGS = {base(o): o for o in OBJS if base(o) in DATA['meta']['segments']}
AGLETS = {base(o)[5:]: o for o in OBJS if base(o).startswith('aglet')}
print('деталей:', len(PARTS), 'отрезков шнурка:', len(SEGS), 'наконечников:', len(AGLETS), flush=True)

def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None

# шнурок проявляется по длине: UV.x = 8·t вдоль ленты; видимая часть — где UV.x < 8·reveal
def lace_reveal(mat):
    nt = mat.node_tree; N, L = nt.nodes, nt.links
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL'); bsdf = principled(mat)
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['UV'], sep.inputs[0])
    at = N.new('ShaderNodeAttribute'); at.attribute_type = 'OBJECT'; at.attribute_name = 'reveal'
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 8.0; L.new(at.outputs['Fac'], mul.inputs[0])
    lt = N.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; L.new(sep.outputs['X'], lt.inputs[0]); L.new(mul.outputs[0], lt.inputs[1])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    L.new(lt.outputs[0], mx.inputs['Fac']); L.new(tr.outputs[0], mx.inputs[1]); L.new(bsdf.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs['Surface'])

done = set()
for o in OBJS:
    if o.type != 'MESH':
        continue
    for slot in o.material_slots:
        m = slot.material
        if not m or m.name in done:
            continue
        done.add(m.name)
        b = principled(m); k = m.name.split('.')[0]
        if b is None:
            continue
        if k == 'upper':                                   # трикотаж: ворс
            b.inputs['Sheen Weight'].default_value = 0.45; b.inputs['Sheen Roughness'].default_value = 0.55
        elif k in ('foamTop', 'foamBottom'):               # пена пропускает свет
            b.inputs['Subsurface Weight'].default_value = 0.25
            b.inputs['Subsurface Radius'].default_value = (1.0, 0.75, 0.55); b.inputs['Subsurface Scale'].default_value = 0.08
        elif k == 'laces':
            lace_reveal(m)
for s in SEGS.values():
    s['reveal'] = 1.0

# ---------------------------------------------------------------------
# Студия: чёрный глянцевый пластик на полу, темнота вокруг
# ---------------------------------------------------------------------
bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
floor = bpy.context.active_object; floor.name = 'floor'
fm = bpy.data.materials.new('floor'); fm.use_nodes = True; floor.data.materials.append(fm)
fb = principled(fm); fnt = fm.node_tree
fb.inputs['Base Color'].default_value = (0.004, 0.004, 0.0045, 1)
noise = fnt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.35; noise.inputs['Detail'].default_value = 4
rng = fnt.nodes.new('ShaderNodeMapRange'); rng.inputs['To Min'].default_value = 0.2; rng.inputs['To Max'].default_value = 0.38
fnt.links.new(noise.outputs['Fac'], rng.inputs['Value']); fnt.links.new(rng.outputs['Result'], fb.inputs['Roughness'])

world = bpy.data.worlds.new('studio'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0

def look_at(obj, target):
    d = (target - obj.location).normalized()
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

def area(name, size, pos, target, color):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size, ld.size_y = size; ld.color = lin(color); ld.energy = 0
    o = bpy.data.objects.new(name, ld); sc.collection.objects.link(o)
    o.location = v3(*pos); look_at(o, v3(*target)); o.visible_camera = False
    return o

key = area('key', (3.6, 2.0), (1.5, 4.6, 3.6), (0, 0.6, 0), '#fff4e8')
rimL = area('rimL', (0.35, 3.6), (-3.8, 2.0, -2.8), (0, 0.8, 0), '#cfdcff')
rimR = area('rimR', (0.35, 3.6), (3.6, 1.9, -2.6), (0, 0.8, 0), '#ffd8b8')
sweep = area('sweep', (0.2, 3.0), (0, 1.5, 3), (0, 0.6, 0), '#ffffff')
td = bpy.data.lights.new('top', 'SPOT'); td.spot_size = math.radians(48); td.spot_blend = 0.75; td.shadow_soft_size = 0.35; td.color = lin('#fff1e0'); td.energy = 0
top = bpy.data.objects.new('top', td); sc.collection.objects.link(top); top.location = v3(0.3, 11, 1.2); look_at(top, v3(0, 1.6, 0)); top.visible_camera = False

# студийные панели вокруг (как карта окружения в плеере): мягкие блики и подсветка чёрного
# трикотажа; камере не видны, яркость = цвет · k · env (env — из кадра)
ENV_PANELS = []
def env_panel(w, h, pos, color, k):
    bpy.ops.mesh.primitive_plane_add(size=1, location=v3(*pos))
    o = bpy.context.active_object; o.scale = (w, h, 1); look_at(o, v3(0, 0.6, 0))
    m = bpy.data.materials.new('envpanel'); m.use_nodes = True; nt = m.node_tree
    for n_ in list(nt.nodes):
        if n_.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n_)
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*lin(color), 1)
    nt.links.new(em.outputs[0], next(n_ for n_ in nt.nodes if n_.type == 'OUTPUT_MATERIAL').inputs['Surface'])
    o.data.materials.append(m)
    o.visible_camera = False; o.visible_shadow = False
    ENV_PANELS.append((em.inputs['Strength'], k))
env_panel(6, 3, (0.5, 7, 1.2), '#ffffff', 7)       # большой верхний софтбокс
env_panel(0.9, 7, (-6.5, 2.6, 1.5), '#f2f6ff', 6)  # полоса слева
env_panel(0.9, 7, (6.5, 2.6, -1.2), '#fff4ea', 6)  # полоса справа
env_panel(5, 1.6, (0, 1.6, -7.5), '#ffffff', 1.6)  # задний свет
env_panel(3.5, 2.4, (2.5, 2.2, 7), '#ffffff', 2.4) # фронтальная заливка

def set_lights(Lg):
    for sock, k in ENV_PANELS:
        sock.default_value = k * Lg['env']
    key.data.energy = Lg['key'] * math.pi * 3.6 * 2.0
    rimL.data.energy = Lg['rimL'] * math.pi * 0.35 * 3.6
    rimR.data.energy = Lg['rimR'] * math.pi * 0.35 * 3.6
    top.data.energy = Lg['top'] * 4 * math.pi
    s = Lg.get('sweep')
    if s:
        sweep.data.size, sweep.data.size_y = s['w'], s['h']
        sweep.location = v3(*s['pos']); look_at(sweep, v3(*s['look']))
        sweep.data.energy = s['L'] * math.pi * s['w'] * s['h']
    else:
        sweep.data.energy = 0

# ---------------------------------------------------------------------
# Камера: глубина резкости (7 лепестков), смаз затвором 180°
# ---------------------------------------------------------------------
cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24; cd.clip_start = 0.02; cd.clip_end = 300
cd.dof.use_dof = True; cd.dof.aperture_blades = 7; cd.dof.aperture_rotation = math.radians(12)

# ---------------------------------------------------------------------
# Ключи: камера, детали, наконечники, проявление шнурка — для смаза и покадровой смены
# ---------------------------------------------------------------------
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
    for k, o in PARTS.items():
        if k in F['parts']:
            key_matrix(o, m3(F['parts'][k]), f)
    bpy.context.view_layer.update()
    for sd, o in AGLETS.items():
        mat = F['aglets'].get(sd)
        o.hide_render = mat is None
        o.keyframe_insert('hide_render', frame=f)
        if mat:
            key_matrix(o, m3(mat), f)
    for name, o in SEGS.items():
        o['reveal'] = float(F['reveal'].get(name, 1.0))
        o.keyframe_insert('["reveal"]', frame=f)

cuts = {i + 1 for i in range(1, len(FR)) if FR[i]['shot'] != FR[i - 1]['shot']}
animated = [cam, cd] + list(PARTS.values()) + list(AGLETS.values())
for o in animated:
    ad = o.animation_data
    if not (ad and ad.action):
        continue
    for fc in ad.action.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT' if (int(round(kp.co[0])) + 1 in cuts or fc.data_path == 'hide_render') else 'LINEAR'
for o in SEGS.values():  # проявление шнурка — ступенькой по кадрам, без «размазывания»
    ad = o.animation_data
    if ad and ad.action:
        for fc in ad.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'

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
sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.04
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 2; sc.cycles.glossy_bounces = 4
sc.cycles.transmission_bounces = 4; sc.cycles.transparent_max_bounces = 12; sc.cycles.volume_bounces = 0
sc.cycles.sample_clamp_indirect = 6; sc.cycles.blur_glossy = 0.5
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
    set_lights(FR[fi]['light'])
    r.filepath = os.path.abspath(path)
    bpy.ops.render.render(write_still=True)
    print(f'КАДР {fi} ({FR[fi]["shot"]}) {time.time() - t0:.1f} с', flush=True)
