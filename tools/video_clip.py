"""Cut a game animation out of an AI-generated green-screen clip.
Usage: python3 -I tools/video_clip.py <character> <kind> <video.mp4>
kind: jump | slide | fall  (one-shot)  or  idle | roll | elastic | prayer  (loops)
Writes public/assets/characters/<character>-<kind>.webp and FRAMES[character].anims[kind]."""
import sys, json
import numpy as np, cv2
from PIL import Image

name, kind, path = sys.argv[1:4]
LOOP = kind in ('idle', 'roll', 'elastic', 'prayer', 'chase')
cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 24
frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))

def key(rgb):
    f = rgb.astype(np.float32); r, g, b = f[..., 0], f[..., 1], f[..., 2]
    m = g - np.maximum(r, b)
    a = cv2.GaussianBlur(np.clip((70 - m) / 45, 0, 1), (3, 3), 0)
    g2 = np.where(m > 0, np.maximum(r, b) + np.clip(m, 0, None) * (a * .15), g)
    out = np.dstack([r, np.minimum(g, g2), b, a * 255])
    hard = (a > .5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(hard, np.ones((7, 7), np.uint8)))
    if n > 2:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); out[lab != big, 3] = 0
    return out

keyed = [key(f) for f in frames]
boxes = []
for k in keyed:
    ys, xs = np.nonzero(k[..., 3] > 128)
    if not len(ys): boxes.append(None); continue
    top, bot = ys.min(), ys.max()
    up = k[top:top + max(2, int((bot - top) * .45)), :, 3] > 128
    uy, ux = np.nonzero(up)
    boxes.append((top, bot, (ux.mean() if len(ux) else xs.mean()), xs.min(), xs.max()))
valid = [i for i, b in enumerate(boxes) if b]
early = valid[:max(4, int(.4 * fps))]
ref_ground = float(np.median([boxes[i][1] for i in early]))
ref_h = float(np.median([boxes[i][1] - boxes[i][0] for i in (early if not LOOP else valid)]))
cxs = np.array([boxes[i][2] if boxes[i] else np.nan for i in range(len(boxes))])
cxs = np.where(np.isnan(cxs), np.nanmedian(cxs), cxs)
cxs = cv2.GaussianBlur(cxs.reshape(-1, 1).astype(np.float32), (1, 9), 0).ravel()

# choose the frames for this animation
idx = valid
if kind == 'jump':
    lift = np.array([ref_ground - boxes[i][1] if boxes[i] else 0 for i in range(len(boxes))])
    lift = cv2.GaussianBlur(lift.reshape(-1, 1).astype(np.float32), (1, 3), 0).ravel()
    m = int(np.argmax(lift)); th = max(ref_h * .08, lift[m] * .25)
    a = m
    while a > 0 and lift[a] > th: a -= 1
    b = m
    while b < len(lift) - 1 and lift[b] > th: b += 1
    a = max(a, m - 12); b = min(b, m + 12)
    idx = list(range(max(0, a - 1), min(len(boxes), b + 2)))
elif kind == 'slide':
    hs = np.array([(boxes[i][1] - boxes[i][0]) if boxes[i] else ref_h for i in range(len(boxes))])
    low = np.nonzero(hs < ref_h * .8)[0]
    if len(low): idx = list(range(max(0, low[0] - 3), min(len(boxes), low[-1] + 3)))
elif kind == 'fall':
    hs = np.array([(boxes[i][1] - boxes[i][0]) if boxes[i] else ref_h for i in range(len(boxes))])
    low = np.nonzero(hs < ref_h * .85)[0]
    if len(low): idx = list(range(max(0, low[0] - 4), len(boxes)))
idx = [i for i in idx if boxes[i]]
if not LOOP and len(idx) > 20:                  # keep one-shots compact
    idx = [idx[int(round(j))] for j in np.linspace(0, len(idx) - 1, 20)]

CS = 400; s = (CS * .6) / ref_h
def place(i, ground):
    M = np.float32([[s, 0, CS / 2 - cxs[i] * s], [0, s, CS * .97 - ground * s]])
    return cv2.warpAffine(keyed[i], M, (CS, CS), flags=cv2.INTER_AREA, borderValue=(0, 0, 0, 0))
if kind == 'jump':
    cells = [place(i, boxes[i][1]) for i in idx]          # feet at the bottom: the game lifts the sprite itself
else:
    cells = [place(i, ref_ground) for i in idx]

if LOOP:
    start = int((1.1 if kind == 'roll' else 1.6 if kind == 'chase' else .3) * fps)
    sil = [cv2.resize(c[..., 3], (50, 50)) / 255 for c in cells]
    best = None
    for s0 in range(start, max(start + 1, len(cells) - 14)):
        for P in (range(36, 60) if kind == 'idle' else range(18, 40) if kind == 'roll' else range(10, 30)):
            if s0 + P + 1 >= len(cells): break
            d = np.abs(sil[s0] - sil[s0 + P]).mean() + np.abs(sil[s0 + 1] - sil[s0 + P + 1]).mean()
            if best is None or d < best[0]: best = (d, s0, P)
    if best: cells = cells[best[1]:best[1] + best[2]]
    print(name, kind, 'loop', best and (best[1], best[2], round(best[0], 4)))
else:
    print(name, kind, 'frames', len(cells), idx[0] if idx else None, idx[-1] if idx else None)

n = len(cells); cols = 6; rows = (n + cols - 1) // cols; cw = ch = 256
atlas = Image.new('RGBA', (cols * cw, rows * ch))
for i, c in enumerate(cells):
    atlas.paste(Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA').resize((cw, ch), Image.LANCZOS), ((i % cols) * cw, (i // cols) * ch))
atlas.save(f'public/assets/characters/{name}-{kind}-anim.webp', quality=86, method=6)
F = json.load(open('src/frames.json'))
F.setdefault(name, {}).setdefault('anims', {})[kind] = {'count': n, 'cols': cols, 'rows': rows, 'cellW': cw, 'cellH': ch, 'w': atlas.width, 'h': atlas.height,
                                         'bodyPx': ch * .6, 'footPx': ch * .03, 'fps': fps, 'loop': LOOP}
json.dump(F, open('src/frames.json', 'w'))
prev = Image.new('RGBA', atlas.size, (40, 60, 70, 255)); prev.alpha_composite(atlas)
prev.convert('RGB').save(f'/tmp/claude-0/-home-user-tembelrun/4062c504-a2b8-563a-9465-4be4b204f59c/scratchpad/vid/{name}-{kind}.jpg', quality=80)
