# Tembel Run — data center night shift

A 3D endless runner set in a realistic data center, starring the Rack Runner crew.
Run the cold aisles, swipe to turn at junctions, jump cable ramps and open floor tiles,
slide under dropped cable trays, dodge carts and ladders, and collect QSFP modules
while a power outage chases you.

## Play locally

```bash
npm install
npm run dev
```

Production build: `npm run build` (static output in `dist/`, works on any static host).

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Lane change / turn at a junction | swipe left / right | ← → or A / D |
| Jump | swipe up | ↑, W or Space |
| Slide | swipe down | ↓ or S |
| Pause | Ⅱ button | P / Esc |

Turning: when the arrows light up, swipe toward an open side. If you don't turn, you hit the rack row at the end of the aisle.
Hitting a cable ramp, or clipping the edge of a cart, makes you stumble and lets the outage catch up. A second stumble while it's close ends the run.

## Crew and powers

Grab the blue power-up orb to trigger your character's power for 8 seconds:

- **הטכנאי (the Technician):** QSFP magnet
- **אביחי (Avichai):** giant mode, invincible, smashes equipment
- **אריאל (Ariel):** rolls as a ball and knocks obstacles over
- **ליעד (Liad):** elastic arms that pull in QSFPs from every lane
- **גבי (Gabi):** prayer power, the hall glows white, plus a magnet and invincibility

## Graphics

- three.js with physically based materials, ACES tone mapping, an image-based environment, bloom, a subtle chromatic/film pass and soft shadows
- Rack faceplates (servers, switches with patch cables, UPS and CRAH units), perforated raised-floor tiles, containment panels and ceiling, all generated procedurally with normal and roughness maps; LEDs blink in a shader
- Real point lights follow the ceiling fixtures closest to the runner
- Four rooms: Server Hall, Network Core, Cold Aisle, Power/UPS

Settings: graphics quality (auto / high / performance), shadows, volume and on-screen buttons.

## Assets

`public/assets/characters/*.webp` are the original Rack Runner sprite sheets with the backgrounds removed
(`tools/key_sprites.py`). Frame bounds are measured by `tools/frame_bounds.py` into `src/frames.json`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`
(enable it under Settings → Pages → Source: GitHub Actions).
