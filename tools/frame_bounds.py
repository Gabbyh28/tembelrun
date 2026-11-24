"""Measure the opaque bounding box of each atlas cell -> src/frames.json"""
import json, sys
import numpy as np
from PIL import Image
GRIDS = {'technician': (4, 3), 'avichai': (4, 3), 'ariel': (4, 3), 'liad': (4, 3), 'gabi': (4, 3), 'ariel-roll': (4, 2), 'liad-rubber': (2, 2), 'hanan-retro': (4, 1)}
out = {}
for name, (cols, rows) in GRIDS.items():
    im = Image.open(f'public/assets/characters/{name}.webp')
    a = np.asarray(im.getchannel('A')) > 80
    H, W = a.shape; cw, ch = W / cols, H / rows
    frames = []
    for r in range(rows):
        for c in range(cols):
            x0, y0, x1, y1 = int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)
            sub = a[y0:y1, x0:x1]
            ys, xs = np.nonzero(sub)
            fx0, fx1, fy0, fy1 = xs.min() + x0 - 2, xs.max() + x0 + 3, ys.min() + y0 - 2, ys.max() + y0 + 3
            # horizontal centre of mass of the lower body = where the feet are
            frames.append([int(fx0), int(fy0), int(fx1 - fx0), int(fy1 - fy0), round(float(xs.mean() + x0), 1)])
    out[name] = {'w': W, 'h': H, 'frames': frames}
json.dump(out, open('src/frames.json', 'w'))
print({k: v['frames'][10] if len(v['frames']) > 10 else v['frames'][0] for k, v in out.items()})
