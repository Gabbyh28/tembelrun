"""Find the smoothest cyclic order of the 8 run frames for each character by
comparing foot-aligned silhouettes, and store it in src/frames.json."""
import json, itertools
import numpy as np
from PIL import Image
F = json.load(open('src/frames.json'))
for name in ['technician', 'avichai', 'ariel', 'liad', 'gabi']:
    im = Image.open(f'public/assets/characters/{name}.webp').convert('RGBA')
    fr = F[name]['frames']
    sil = []
    for x, y, w, h, cx in fr[:8]:
        c = im.crop((int(cx) - 110, y + h - 340, int(cx) + 110, y + h)).resize((110, 170))
        a = np.asarray(c, dtype=np.float32)
        sil.append(np.concatenate([a[..., 3:] / 255, a[..., :3] / 255 * (a[..., 3:] / 255)], -1))
    D = np.array([[np.abs(sil[i] - sil[j]).mean() for j in range(8)] for i in range(8)])
    best = None
    for perm in itertools.permutations(range(1, 8)):
        order = (0,) + perm
        cost = sum(D[order[k], order[(k + 1) % 8]] for k in range(8))
        if best is None or cost < best[0]: best = (cost, order)
    natural = sum(D[k, (k + 1) % 8] for k in range(8))
    F[name]['runOrder'] = list(best[1])
    print(name, 'natural', round(natural, 3), 'best', round(best[0], 3), best[1])
json.dump(F, open('src/frames.json', 'w'))
