"""Turn an AI-generated green-screen running video into a seamless run-cycle
atlas: key out the green, align every frame to the ground and body centre,
find the cleanest loop and pack it into public/assets/characters/<name>-run.webp.
Usage: python3 -I tools/video_cycle.py <name> <video.mp4> [start_seconds]"""
import sys, json
import numpy as np, cv2
from PIL import Image

name, path = sys.argv[1], sys.argv[2]
start_s = float(sys.argv[3]) if len(sys.argv) > 3 else 1.8
cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 24
frames = []
while True:
    ok, f = cap.read()
    if not ok: break
    frames.append(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
frames = frames[int(start_s * fps):]

def key(rgb):
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    m = g - np.maximum(r, b)                       # greenness
    a = np.clip((70 - m) / 45, 0, 1)               # m>=70 bg, m<=25 fg
    a = cv2.GaussianBlur(a, (3, 3), 0)
    # despill
    g2 = np.where(m > 0, np.maximum(r, b) + np.clip(m, 0, None) * (a * .15), g)
    out = np.dstack([r, np.minimum(g, g2), b, a * 255])
    # keep the biggest blob (the runner)
    hard = (a > .5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(hard, np.ones((7, 7), np.uint8)))
    if n > 2:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); out[lab != big, 3] = 0
    return out

keyed = [key(f) for f in frames]
H, W = keyed[0].shape[:2]
info = []
for k in keyed:
    a = k[..., 3] > 128
    ys, xs = np.nonzero(a)
    top, bot = ys.min(), ys.max()
    upper = a[top:top + int((bot - top) * .45)]
    uy, ux = np.nonzero(upper)
    info.append((top, bot, ux.mean()))
info = np.array(info, np.float32)
# ground line = rolling max of the lowest foot (feet in the air don't move it)
win = 12
ground = np.array([info[max(0, i - win):i + win + 1, 1].max() for i in range(len(info))])
ground = cv2.GaussianBlur(ground.reshape(-1, 1), (1, 15), 0).ravel()
cx = cv2.GaussianBlur(info[:, 2].reshape(-1, 1), (1, 9), 0).ravel()
height = np.array([ground[i] - info[max(0, i - win):i + win + 1, 0].min() for i in range(len(info))])
height = cv2.GaussianBlur(height.reshape(-1, 1), (1, 21), 0).ravel()
ref_h = float(np.median(height))

CW, CH = 300, 400
aligned = []
for i, k in enumerate(keyed):
    s = (CH * .86) / height[i]                     # normalise body height
    M = np.float32([[s, 0, CW / 2 - cx[i] * s], [0, s, CH * .97 - ground[i] * s]])
    aligned.append(cv2.warpAffine(k, M, (CW, CH), flags=cv2.INTER_AREA, borderValue=(0, 0, 0, 0)))

# find the loop: frame s and s+P should match (and their neighbours)
sil = [cv2.resize(a[..., 3], (60, 80)) / 255 for a in aligned]
best = None
for s in range(0, max(1, len(aligned) - 30)):
    for P in range(12, 26):
        if s + P + 1 >= len(aligned): break
        d = np.abs(sil[s] - sil[s + P]).mean() + np.abs(sil[s + 1] - sil[s + P + 1]).mean()
        # prefer full two-step cycles over half cycles
        if best is None or d < best[0]: best = (d, s, P)
d, s0, P = best
cycle = aligned[s0:s0 + P]
print(name, 'loop start', s0, 'period', P, 'frames =', round(P / fps, 2), 's', 'err', round(d, 4))

cols = 6; rows = (P + cols - 1) // cols; cw, ch = 240, 320
atlas = Image.new('RGBA', (cols * cw, rows * ch))
for i, c in enumerate(cycle):
    im = Image.fromarray(np.clip(c, 0, 255).astype(np.uint8), 'RGBA').resize((cw, ch), Image.LANCZOS)
    atlas.paste(im, ((i % cols) * cw, (i // cols) * ch))
atlas.save(f'public/assets/characters/{name}-run.webp', quality=86, method=6)
F = json.load(open('src/frames.json'))
F[name]['run'] = {'count': P, 'cols': cols, 'rows': rows, 'cellW': cw, 'cellH': ch, 'w': atlas.width, 'h': atlas.height,
                  'bodyPx': ch * .86, 'footPx': ch * .03, 'fps': fps, 'video': True}
json.dump(F, open('src/frames.json', 'w'))
prev = Image.new('RGBA', atlas.size, (40, 60, 70, 255)); prev.alpha_composite(atlas)
prev.convert('RGB').save(f'/tmp/claude-0/-home-user-tembelrun/4062c504-a2b8-563a-9465-4be4b204f59c/scratchpad/vid/{name}-cycle.jpg', quality=85)
