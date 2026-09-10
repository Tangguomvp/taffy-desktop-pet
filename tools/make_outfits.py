"""Hue-shift only the 1883 navy cloth, same quality as 四叶草绿 / 纯白礼服.
Keeps red collar, gold trim, white shirt, skin, pink clovers.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "models" / "taffy1883" / "tex" / "cloth.png"
OUT = ROOT / "models" / "taffy1883" / "tex" / "outfits"
SIZE = 2048

# Matched to 表情互动 green: dH~-0.23, sat*1.18, val*1.59
PALETTES = {
    "sky": {"h": 0.53, "sat_mul": 1.12, "val_mul": 1.48},   # 晴空蓝
    "mist": {"h": 0.61, "sat_mul": 0.82, "val_mul": 1.38},  # 雾蓝
}


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    df = mx - mn
    h = np.zeros_like(mx)
    s = np.zeros_like(mx)
    v = mx
    nz = df > 1e-5
    s[nz] = df[nz] / np.maximum(mx[nz], 1e-5)
    mr, mg, mb = (mx == r) & nz, (mx == g) & nz, (mx == b) & nz
    h[mr] = np.mod((g[mr] - b[mr]) / df[mr], 6.0)
    h[mg] = (b[mg] - r[mg]) / df[mg] + 2.0
    h[mb] = (r[mb] - g[mb]) / df[mb] + 4.0
    return h / 6.0, s, v


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6.0).astype(np.int32)
    f = h * 6.0 - i
    p = v * (1.0 - s)
    q = v * (1.0 - f * s)
    t = v * (1.0 - (1.0 - f) * s)
    i6 = i % 6
    r = np.choose(i6, [v, q, p, p, t, v])
    g = np.choose(i6, [t, v, v, q, p, p])
    b = np.choose(i6, [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC).convert("RGBA").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    arr = np.asarray(im).astype(np.float32) / 255.0
    rgb, a = arr[..., :3], arr[..., 3]
    h, s, v = rgb_to_hsv(rgb)

    # Navy dress + blue metals/badge/clock. Do NOT touch red collar, gold, skin, white.
    navy = (h > 0.50) & (h < 0.78) & (s > 0.15) & (v > 0.07) & (v < 0.70) & (a > 0.2)

    for name, spec in PALETTES.items():
        hh, ss, vv = h.copy(), s.copy(), v.copy()
        hh[navy] = spec["h"]
        ss[navy] = np.clip(s[navy] * spec["sat_mul"], 0, 1)
        vv[navy] = np.clip(v[navy] * spec["val_mul"], 0, 1)
        out = np.dstack([np.clip(hsv_to_rgb(hh, ss, vv), 0, 1), a])
        dest = OUT / f"{name}.png"
        Image.fromarray((out * 255).astype(np.uint8), "RGBA").save(dest, optimize=True)
        print("wrote", dest)


if __name__ == "__main__":
    main()
