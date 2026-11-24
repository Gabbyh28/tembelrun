"""Turn the Rack Runner sprite sheets into clean RGBA WebP atlases.

Usage: python3 -I tools/key_sprites.py <source-assets-dir> <out-dir>
Magenta sheets are chroma-keyed with despill; checkerboard sheets are
flood-filled from each cell border over neutral light pixels.
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC, OUT = sys.argv[1], sys.argv[2]

def magenta_key(rgb):
    r, g, b = [rgb[..., i].astype(np.float32) for i in range(3)]
    m = np.minimum(r, b) - g                       # how magenta a pixel is
    alpha = np.clip((150 - m) / 90, 0, 1)          # m>=150 -> bg, m<=60 -> fg
    spill = np.clip(np.minimum(r, b) - g, 0, None)
    k = np.clip(1 - alpha + 0.35, 0, 1)
    r2 = r - spill * k * 0.85; b2 = b - spill * k * 0.85
    out = np.stack([r2, g, b2], -1).clip(0, 255)
    return out.astype(np.uint8), alpha

def checker_key(rgb, cols, rows, lo, hi, preserve):
    h, w, _ = rgb.shape
    f = rgb.astype(np.int16)
    sat = f.max(-1) - f.min(-1)
    lum = f.mean(-1)
    cand = (sat <= 14) & (lum >= lo) & (lum <= hi)
    keep = np.zeros((h, w), bool)
    yy, xx = np.mgrid[0:h, 0:w]
    for (px, py, pw, ph) in preserve:              # protect white kippot
        cx, cy = (px + pw / 2) * w, (py + ph / 2) * h
        keep |= ((xx - cx) / 24) ** 2 + ((yy - cy) / 15) ** 2 <= 1
    cand &= ~keep
    lab, n = ndi.label(cand)
    bg = np.zeros((h, w), bool)
    cw, ch = w // cols, h // rows
    border = np.zeros((h, w), bool)
    for c in range(cols + 1):
        border[:, min(w - 1, c * cw)] = True; border[:, max(0, c * cw - 1)] = True
    for r in range(rows + 1):
        border[min(h - 1, r * ch), :] = True; border[max(0, r * ch - 1), :] = True
    ids = np.unique(lab[border & cand])
    bg |= np.isin(lab, ids[ids > 0])
    # enclosed checker pockets (between arms/legs): big components with two tones
    sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    std = ndi.standard_deviation(lum, lab, index=np.arange(1, n + 1))
    for i in np.nonzero((sizes > 250) & (std > 12))[0]:
        bg |= lab == i + 1
    fg = ~bg
    fg = ndi.binary_opening(fg, iterations=1)
    # drop specks
    lab2, n2 = ndi.label(fg)
    if n2:
        s2 = ndi.sum(np.ones_like(lab2), lab2, index=np.arange(1, n2 + 1))
        fg = np.isin(lab2, np.nonzero(s2 > 60)[0] + 1)
    fg = ndi.binary_erosion(fg, iterations=1)
    alpha = ndi.gaussian_filter(fg.astype(np.float32), 0.8)
    return rgb, alpha

def fit_checker(lum, light, dark):
    """Find period/phase of a baked checkerboard (it was resampled, so non-integer)."""
    h, w = lum.shape
    best = None
    ys = np.arange(0, h, 3)[:, None]; xs = np.arange(0, w, 3)[None, :]
    sample = lum[::3, ::3]
    mask = (np.abs(sample - light) < 10) | (np.abs(sample - dark) < 10)
    for p in np.arange(17.0, 19.5, 0.02):
        for ox in np.arange(0, 2 * p, 1.0):
            for oy in (ox,) if False else np.arange(0, 2 * p, 1.0)[::1]:
                pass
            break
    # separable fit: phase in x from rows, phase in y from cols
    def fit1(profile):
        bestp = None
        idx = np.arange(profile.size)
        for p in np.arange(17.0, 19.5, 0.01):
            for o in np.arange(0, 2 * p, 0.5):
                sq = np.floor((idx - o) / p) % 2
                exp = np.where(sq == 0, light, dark)
                err = np.median(np.abs(profile - exp))
                if bestp is None or err < bestp[0]:
                    bestp = (err, p, o)
        return bestp
    return fit1

def checker_pattern_key(rgb, light, dark, preserve):
    f = rgb.astype(np.float32); h, w, _ = f.shape
    lum = f.mean(-1); sat = f.max(-1) - f.min(-1)
    fit1 = fit_checker(lum, light, dark)
    ex = fit1(lum[3, :400]); ey = fit1(lum[:400, 3])
    px, ox = ex[1], ex[2]; py, oy = ey[1], ey[2]
    X = (np.arange(w) - ox) / px; Y = (np.arange(h) - oy) / py
    # parity at (0,3) row/col tells which colour is the "0" square
    sqx = np.floor(X) % 2; sqy = np.floor(Y) % 2
    par = (sqx[None, :] + sqy[:, None]) % 2
    exp = np.where(par == 0, light, dark)
    dx = np.minimum(X - np.floor(X), np.ceil(X) - X) * px
    dy = np.minimum(Y - np.floor(Y), np.ceil(Y) - Y) * py
    edge = (dx[None, :] < 1.6) | (dy[:, None] < 1.6)
    bg = (sat < 12) & ((np.abs(lum - exp) < 11) | (edge & (lum > min(light, dark) - 8)))
    fg = ~bg
    fg = ndi.binary_opening(fg, iterations=2)
    fg = ndi.binary_closing(fg, iterations=4)
    lab, n = ndi.label(fg)
    if n:
        s = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        fg = np.isin(lab, np.nonzero(s > 400)[0] + 1)
    fg = ndi.binary_erosion(fg, iterations=1)
    return rgb, ndi.gaussian_filter(fg.astype(np.float32), 0.8)

def ml_key(img, cols, rows, model):
    """Segment each cell with a person-segmentation model (rembg)."""
    from rembg import remove, new_session
    sess = new_session(model)
    rgb = np.asarray(img.convert('RGB'))
    h, w, _ = rgb.shape
    alpha = np.zeros((h, w), np.float32)
    cw, ch = w / cols, h / rows
    for r in range(rows):
        for c in range(cols):
            x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
            cell = Image.fromarray(rgb[y0:y1, x0:x1])
            m = np.asarray(remove(cell, session=sess, only_mask=True)).astype(np.float32) / 255
            alpha[y0:y1, x0:x1] = m
    hard = alpha > 0.5
    lab, n = ndi.label(hard)
    if n:
        s = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        hard = np.isin(lab, np.nonzero(s > 300)[0] + 1)
    hard = ndi.binary_erosion(hard, iterations=1)
    return rgb, ndi.gaussian_filter(hard.astype(np.float32), 0.9)

def alpha_from_existing(img):
    a = np.asarray(img.getchannel('A')).astype(np.float32) / 255
    rgb = np.asarray(img.convert('RGB'))
    # technician sheet has red/yellow fringe from an old key: erode slightly
    hard = ndi.binary_erosion(a > 0.5, iterations=2)
    a = np.minimum(a, ndi.gaussian_filter(hard.astype(np.float32), 0.8))
    return rgb, a

ARIEL_KIPPA = [[0.1381,0.0166,0.0110,0.0083],[0.3902,0.0166,0.0110,0.0083],[0.6285,0.0166,0.0110,0.0083],[0.8860,0.0166,0.0110,0.0083],[0.1333,0.3527,0.0110,0.0083],[0.3874,0.3499,0.0110,0.0083],[0.6278,0.3517,0.0110,0.0083],[0.8847,0.3517,0.0110,0.0083],[0.1374,0.7136,0.0117,0.0092],[0.4137,0.7680,0.0117,0.0092],[0.8833,0.6777,0.0110,0.0083]]
JOBS = {
  'technician':  dict(kind='alpha'),
  'avichai':     dict(kind='checker', cols=4, rows=3, lo=110, hi=206, preserve=[]),
  'ariel':       dict(kind='ml', cols=4, rows=3),
  'ariel-roll':  dict(kind='ml', cols=4, rows=2),
  'liad':        dict(kind='magenta'),
  'liad-rubber': dict(kind='magenta'),
  'gabi':        dict(kind='magenta'),
}
os.makedirs(OUT, exist_ok=True)
only = sys.argv[3:]
for name, job in JOBS.items():
    if only and name not in only: continue
    img = Image.open(os.path.join(SRC, name + '.png'))
    if job['kind'] == 'alpha':
        rgb, a = alpha_from_existing(img.convert('RGBA'))
    elif job['kind'] == 'magenta':
        rgb, a = magenta_key(np.asarray(img.convert('RGB')))
    elif job['kind'] == 'ml':
        rgb, a = ml_key(img, job['cols'], job['rows'], job.get('model', 'isnet-general-use'))
    elif job['kind'] == 'pattern':
        rgb, a = checker_pattern_key(np.asarray(img.convert('RGB')), job['light'], job['dark'], [])
    else:
        rgb, a = checker_key(np.asarray(img.convert('RGB')), job['cols'], job['rows'], job['lo'], job['hi'], job['preserve'])
    rgba = np.dstack([rgb, (a * 255).astype(np.uint8)])
    out = Image.fromarray(rgba, 'RGBA')
    out.save(os.path.join(OUT, name + '.webp'), quality=90, method=6)
    # preview on dark grey for inspection
    prev = Image.new('RGBA', out.size, (40, 60, 70, 255)); prev.alpha_composite(out)
    prev.convert('RGB').resize((out.width // 2, out.height // 2)).save(os.path.join(OUT, '..', '..', '..', 'tools', '_prev_' + name + '.jpg'))
    print(name, out.size, os.path.getsize(os.path.join(OUT, name + '.webp')))
