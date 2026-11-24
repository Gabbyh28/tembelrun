"""Build smooth 24-frame run cycles: reorder the 8 photographed run frames into
the smoothest loop, align them at the feet, and synthesise two in-between frames
for every pair with bidirectional optical-flow morphing.
Writes public/assets/characters/<name>-run.webp and run-cycle info into src/frames.json."""
import json, sys
import numpy as np, cv2
from PIL import Image
F = json.load(open('src/frames.json'))
CW, CH, SCALE, STEPS = 320, 384, .8, 3
names = sys.argv[1:] or ['technician', 'avichai', 'ariel', 'liad', 'gabi']

def keep_main(c):
    # drop stray fragments: keep the biggest silhouette blob (and anything touching it)
    m = (c[..., 3] > .25).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cv2.dilate(m, np.ones((5, 5), np.uint8)))
    if n > 2:
        big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        c[lab != big] = 0
    return c

def cell(img, fr):
    x, y, w, h, cx = fr
    # only look inside this frame's own sheet cell
    gw, gh = img.shape[1] / 4, img.shape[0] / 3
    col, row = int((x + w / 2) // gw), int((y + h / 2) // gh)
    img = img.copy(); mask = np.zeros(img.shape[:2], bool)
    mask[int(row * gh):int((row + 1) * gh), int(col * gw):int((col + 1) * gw)] = True
    img[~mask] = 0
    out = np.zeros((CH, CW, 4), np.float32)
    sx0, sy0 = int(round(cx)) - CW // 2, y + h - CH + 6
    src = img[max(0, sy0):sy0 + CH, max(0, sx0):sx0 + CW]
    oy, ox = max(0, -sy0), max(0, -sx0)
    out[oy:oy + src.shape[0], ox:ox + src.shape[1]] = src
    return keep_main(out)

def flow(a, b):
    ga = (a[..., :3].mean(-1) * a[..., 3] * .6 + a[..., 3] * 255 * .4).astype(np.uint8)
    gb = (b[..., :3].mean(-1) * b[..., 3] * .6 + b[..., 3] * 255 * .4).astype(np.uint8)
    return cv2.calcOpticalFlowFarneback(ga, gb, None, .5, 5, 25, 6, 7, 1.5, 0)

def warp(img, fx, fy):
    gx, gy = np.meshgrid(np.arange(CW, dtype=np.float32), np.arange(CH, dtype=np.float32))
    return cv2.remap(img, gx + fx, gy + fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

def morph(a, b, t):
    fab, fba = flow(a, b), flow(b, a)
    # premultiply so edges blend cleanly
    pa = a.copy(); pa[..., :3] *= pa[..., 3:]
    pb = b.copy(); pb[..., :3] *= pb[..., 3:]
    wa = warp(pa, -t * -fba[..., 0], -t * -fba[..., 1]) if False else warp(pa, t * fba[..., 0], t * fba[..., 1])
    wb = warp(pb, (1 - t) * fab[..., 0], (1 - t) * fab[..., 1])
    out = wa * (1 - t) + wb * t
    al = np.clip(out[..., 3:], 1e-4, 1)
    res = out.copy(); res[..., :3] = out[..., :3] / al
    # tighten the soft double edge a little
    res[..., 3] = np.clip((out[..., 3] - .5) * 1.6 + .5, 0, 1)
    return keep_main(res)

for name in names:
    img = np.asarray(Image.open(f'public/assets/characters/{name}.webp').convert('RGBA')).astype(np.float32)
    img[..., 3] /= 255
    fr = F[name]['frames']; order = F[name]['runOrder']
    keys = [cell(img, fr[i]) for i in order]
    cells = []
    for k in range(8):
        a, b = keys[k], keys[(k + 1) % 8]
        cells.append(a)
        for s in range(1, STEPS):
            cells.append(morph(a, b, s / STEPS))
    n = len(cells); cols = 6; rows = (n + cols - 1) // cols
    w, h = int(CW * SCALE), int(CH * SCALE)
    atlas = Image.new('RGBA', (cols * w, rows * h))
    for i, c in enumerate(cells):
        rgba = np.dstack([np.clip(c[..., :3], 0, 255), np.clip(c[..., 3] * 255, 0, 255)]).astype(np.uint8)
        atlas.paste(Image.fromarray(rgba, 'RGBA').resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
    atlas.save(f'public/assets/characters/{name}-run.webp', quality=86, method=6)
    idle_h = fr[11][3]
    F[name]['run'] = {'count': n, 'cols': cols, 'rows': rows, 'cellW': w, 'cellH': h, 'w': atlas.width, 'h': atlas.height,
                      'bodyPx': idle_h * SCALE, 'footPx': 6 * SCALE}
    print(name, n, atlas.size)
json.dump(F, open('src/frames.json', 'w'))
