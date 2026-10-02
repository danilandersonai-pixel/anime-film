# Упаковка HDRI (.hdr, Radiance RGBE) в PNG без альфа-канала, чтобы его можно было
# опубликовать как обычную картинку: верхняя половина — мантиссы RGB,
# нижняя — общий показатель степени (в канале R). Расшифровка — js/hdri.js.
# python3 tools/pack-hdr.py in.hdr out.png [ширина] [--dark]  (+ out.preview.jpg для глаза)
# --dark: стены и пол студии темнеют, лампы остаются яркими — тёмная съёмочная студия.
# --floor=k: только нижняя полусфера (без ламп) ×k.
import sys, re, numpy as np
from PIL import Image

def read_hdr(path):
    data = open(path, 'rb').read()
    head_end = data.index(b'\n\n') + 2
    m = re.match(rb'([-+]Y) (\d+) ([-+]X) (\d+)\n', data[head_end:])
    H, W = int(m.group(2)), int(m.group(4))
    p = head_end + m.end()
    out = np.zeros((H, W, 4), np.uint8)
    for y in range(H):
        if data[p] == 2 and data[p + 1] == 2:  # новый RLE: построчно, по каналам
            p += 4
            for c in range(4):
                x = 0
                while x < W:
                    n = data[p]; p += 1
                    if n > 128:
                        n -= 128; out[y, x:x + n, c] = data[p]; p += 1
                    else:
                        out[y, x:x + n, c] = np.frombuffer(data[p:p + n], np.uint8); p += n
                    x += n
        else:
            out[y] = np.frombuffer(data[p:p + W * 4], np.uint8).reshape(W, 4); p += W * 4
    return out

def rgbe_to_float(rgbe):
    e = rgbe[..., 3].astype(np.int32)
    f = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0)
    return rgbe[..., :3].astype(np.float64) * f[..., None]

def float_to_rgbe(img):
    mx = img.max(axis=2)
    m, e = np.frexp(mx)
    scale = np.where(mx > 1e-32, m * 256.0 / np.maximum(mx, 1e-32), 0)
    rgb = np.clip(img * scale[..., None], 0, 255).astype(np.uint8)
    ee = np.where(mx > 1e-32, e + 128, 0).astype(np.uint8)
    return rgb, ee

src, dst = sys.argv[1], sys.argv[2]
args = [a for a in sys.argv[3:] if not a.startswith('--')]
width = int(args[0]) if args else None
img = rgbe_to_float(read_hdr(src))
if width and width != img.shape[1]:
    k = img.shape[1] // width
    img = img.reshape(img.shape[0] // k, k, width, k, 3).mean(axis=(1, 3))
if '--dark' in sys.argv:
    H0 = img.shape[0]
    lum0 = img @ [0.2126, 0.7152, 0.0722]
    sm = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
    keep = 0.22 + 0.78 * sm(2.0, 8.0, lum0)                 # лампы ярче 8 — как есть, стены ×0.22
    lat = (0.5 - (np.arange(H0) + 0.5) / H0) * np.pi        # широта: +π/2 вверху
    below = 1 - 0.9 * sm(0.0, 0.12, -lat)                   # ниже горизонта ещё ×0.1
    lamp = sm(2.0, 8.0, lum0)
    img = img * (keep * (below[:, None] + (1 - below[:, None]) * lamp))[..., None]
fl = [a for a in sys.argv if a.startswith('--floor=')]
if fl:  # --floor=k: всё ниже горизонта (кроме ламп) ×k — там будет свой пол
    k = float(fl[0].split('=')[1]); H0 = img.shape[0]
    lum0 = img @ [0.2126, 0.7152, 0.0722]
    lat = (0.5 - (np.arange(H0) + 0.5) / H0) * np.pi
    t = np.clip(-lat / 0.08, 0, 1); below = 1 - (1 - k) * t * t * (3 - 2 * t)
    lamp = np.clip((lum0 - 2.0) / 6.0, 0, 1)
    img = img * (below[:, None] + (1 - below[:, None]) * lamp)[..., None]
rgb, ee = float_to_rgbe(img)
H, W = rgb.shape[:2]
packed = np.zeros((H * 2, W, 3), np.uint8)
packed[:H] = rgb
packed[H:] = ee[..., None]
Image.fromarray(packed).save(dst, optimize=True)
lum = img @ [0.2126, 0.7152, 0.0722]
print(f'{W}x{H}  макс. яркость {lum.max():.1f}, средняя {lum.mean():.3f}')
prev = img / (1 + img)
Image.fromarray((np.clip(prev, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(dst.replace('.png', '.preview.jpg'), quality=85)
