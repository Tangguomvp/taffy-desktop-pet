"""Build distinct Taffy outfits from the 1883 PMX.

Keep the original high-poly Cloth (and for lolita, the original skirt),
recolor the atlas, hide inventor extras, then append dense accessories.
"""
from __future__ import annotations

import copy
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from pymeshio.common import RGB, RGBA, Vector2, Vector3
from pymeshio.pmx import Bdef1, Material, Vertex
from pymeshio.pmx.reader import read_from_file
from pymeshio.pmx.writer import write_to_file

ROOT = Path(__file__).resolve().parents[1]
SRC_PMX = ROOT / "models" / "taffy1883" / "taffy.pmx"
SRC_TEX = ROOT / "models" / "taffy1883" / "tex"
OUT_ROOT = ROOT / "models" / "pmx"
SHARED = OUT_ROOT / "_shared"

HEAD, UPPER, UPPER2, NECK, HIP = 29, 25, 26, 28, 27
RARM, LARM = 34, 75

INVENTOR_EXTRAS = [
    "CltohRoll",
    "Decorate",
    "Crack-NoLine",
    "BowknotUP-SG",
    "BowknotDown",
]
SKIRT_MATS = ["SkirtFront-SG", "SkirtBack-SG"]

# extra.png is a 4x4 atlas. UV inset avoids bleeding.
CELL = {
    "white": (0, 0),
    "navy": (1, 0),
    "sailor": (2, 0),
    "gold": (3, 0),
    "red": (0, 1),
    "green": (1, 1),
    "black": (2, 1),
    "pink": (3, 1),
    "plaid": (0, 2),
    "lace": (1, 2),
    "inner": (2, 2),
    "fur": (3, 2),
    "navyhem": (0, 3),
    "stargreen": (1, 3),
    "stripe": (2, 3),
    "brown": (3, 3),
}


def V3(x, y, z) -> Vector3:
    return Vector3(float(x), float(y), float(z))


def V2(x, y) -> Vector2:
    return Vector2(float(x), float(y))


def nrm(x, y, z):
    l = math.sqrt(x * x + y * y + z * z) or 1.0
    return V3(x / l, y / l, z / l)


def uv_cell(name, u=0.5, v=0.5):
    c, r = CELL[name]
    return ((c + 0.08 + 0.84 * u) / 4.0, (r + 0.08 + 0.84 * v) / 4.0)


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


class NearestSkin:
    def __init__(self, model, vertex_ids):
        self.pts = []
        for i in vertex_ids:
            v = model.vertices[i]
            p = v.position
            self.pts.append((p.x, p.y, p.z, v.deform, v.edge_factor))

    def at(self, pos, fallback=HIP):
        x, y, z = pos
        best_d = 1e18
        best = None
        for px, py, pz, deform, edge in self.pts:
            d = (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2
            if d < best_d:
                best_d = d
                best = (deform, edge)
        if best is None:
            return Bdef1(fallback), 1.0
        return best


def add_v(model, pos, normal, uv, deform, edge=1.0):
    if not isinstance(pos, Vector3):
        pos = V3(*pos)
    if isinstance(deform, NearestSkin):
        deform, edge = deform.at((pos.x, pos.y, pos.z))
    if isinstance(deform, int):
        deform = Bdef1(deform)
    else:
        deform = copy.deepcopy(deform)
    if not isinstance(normal, Vector3):
        normal = nrm(*normal)
    model.vertices.append(Vertex(pos, normal, V2(*uv), deform, float(edge)))
    return len(model.vertices) - 1


def add_tri(idxs, a, b, c, flip=False):
    if flip:
        idxs.extend([a, c, b])
    else:
        idxs.extend([a, b, c])


def add_grid(idxs, grid, flip=False):
    rows, cols = len(grid), len(grid[0])
    for i in range(rows - 1):
        for j in range(cols - 1):
            a, b = grid[i][j], grid[i][j + 1]
            c, d = grid[i + 1][j], grid[i + 1][j + 1]
            add_tri(idxs, a, c, d, flip)
            add_tri(idxs, a, d, b, flip)


def append_material(model, name, extra_tex, new_indices, bothface=True):
    if not new_indices:
        return
    tmpl = model.materials[1]
    flag = tmpl.flag | 1 if bothface else (tmpl.flag & ~1)
    model.indices.extend(new_indices)
    model.materials.append(
        Material(
            name,
            name,
            RGB(1, 1, 1),
            1.0,
            tmpl.specular_factor,
            RGB(tmpl.specular_color.r, tmpl.specular_color.g, tmpl.specular_color.b),
            RGB(tmpl.ambient_color.r, tmpl.ambient_color.g, tmpl.ambient_color.b),
            flag,
            RGBA(tmpl.edge_color.r, tmpl.edge_color.g, tmpl.edge_color.b, tmpl.edge_color.a),
            tmpl.edge_size,
            extra_tex,
            -1,
            0,
            1,
            0,
            "outfit extra",
            len(new_indices),
        )
    )


def strip_materials(model, names):
    names = set(names)
    start = 0
    new_idx = []
    for mat in model.materials:
        n = mat.vertex_count
        chunk = model.indices[start : start + n]
        start += n
        if mat.name in names:
            mat.vertex_count = 0
            mat.alpha = 0.0
        else:
            new_idx.extend(chunk)
    model.indices[:] = new_idx


def mat_vertex_ids(model, names):
    names = set(names)
    start = 0
    found = set()
    for mat in model.materials:
        n = mat.vertex_count
        if mat.name in names:
            found.update(model.indices[start : start + n])
        start += n
    return found


def reshape_skirt_lolita(model):
    """Keep original skirt topology: shorten hem, keep panier volume."""
    for vi in mat_vertex_ids(model, SKIRT_MATS):
        p = model.vertices[vi].position
        t = (7.74 - p.y) / (7.74 - 2.90)
        t = max(0.0, min(1.0, t))
        p.y = 7.74 - t * (7.74 - 4.92)
        s = 1.0 + 0.10 * (t ** 1.15)
        p.x *= s
        p.z *= s


def basis_from_axis(axis):
    ax, ay, az = axis
    l = math.sqrt(ax * ax + ay * ay + az * az) or 1
    ax, ay, az = ax / l, ay / l, az / l
    if abs(ay) < 0.9:
        bx, by, bz = 0.0, 1.0, 0.0
    else:
        bx, by, bz = 1.0, 0.0, 0.0
    cx = by * az - bz * ay
    cy = bz * ax - bx * az
    cz = bx * ay - by * ax
    cl = math.sqrt(cx * cx + cy * cy + cz * cz) or 1
    cx, cy, cz = cx / cl, cy / cl, cz / cl
    dx = ay * cz - az * cy
    dy = az * cx - ax * cz
    dz = ax * cy - ay * cx
    return (cx, cy, cz), (dx, dy, dz)


def ring_pt(a, y, r):
    return (math.sin(a) * r, y, -math.cos(a) * r)


def add_lathe(model, idxs, profile, segs, uv_name, skin, a0=0.0, a1=2 * math.pi, wave=0.0, waves=12):
    rows = []
    closed = abs((a1 - a0) - 2 * math.pi) < 1e-4
    nseg = segs if closed else segs
    for pi, (y, r) in enumerate(profile):
        row = []
        v = pi / max(1, len(profile) - 1)
        for i in range(nseg + (0 if closed else 1)):
            t = i / nseg
            a = a0 + (a1 - a0) * t
            rr = r * (1.0 + wave * math.sin(a * waves))
            p = ring_pt(a, y, rr)
            nx, nz = math.sin(a), -math.cos(a)
            uv = uv_cell(uv_name, t, v)
            deform, edge = skin.at(p) if not isinstance(skin, int) else (skin, 1.0)
            row.append(add_v(model, p, nrm(nx, 0.16, nz), uv, deform, edge))
        rows.append(row)
    cols = len(rows[0])
    for ri in range(len(rows) - 1):
        for i in range(nseg):
            j = (i + 1) % cols if closed else i + 1
            add_tri(idxs, rows[ri][i], rows[ri + 1][i], rows[ri + 1][j])
            add_tri(idxs, rows[ri][i], rows[ri + 1][j], rows[ri][j])
    return rows


def add_sphere(model, idxs, center, radius, segs, uv_name, skin, squash=(1, 1, 1)):
    stacks, slices = max(4, segs // 2), segs
    grid = []
    for i in range(stacks + 1):
        row = []
        phi = math.pi * i / stacks
        v = i / stacks
        for j in range(slices):
            th = 2 * math.pi * j / slices
            x = center[0] + radius * squash[0] * math.sin(phi) * math.cos(th)
            y = center[1] + radius * squash[1] * math.cos(phi)
            z = center[2] + radius * squash[2] * math.sin(phi) * math.sin(th)
            u = j / slices
            deform, edge = skin.at((x, y, z)) if not isinstance(skin, int) else (skin, 1.0)
            row.append(add_v(model, (x, y, z), nrm(x - center[0], y - center[1], z - center[2]), uv_cell(uv_name, u, v), deform, edge))
        grid.append(row)
    add_grid(idxs, grid)


def add_cone(model, idxs, base, tip, radius, segs, uv_name, skin):
    axis = (tip[0] - base[0], tip[1] - base[1], tip[2] - base[2])
    u, v = basis_from_axis(axis)
    tip_n = nrm(*axis)
    deform_t, edge_t = skin.at(tip) if not isinstance(skin, int) else (skin, 1.0)
    tip_i = add_v(model, tip, tip_n, uv_cell(uv_name, 0.5, 0.0), deform_t, edge_t)
    ring = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ox = math.cos(a) * radius
        oy = math.sin(a) * radius
        px = base[0] + u[0] * ox + v[0] * oy
        py = base[1] + u[1] * ox + v[1] * oy
        pz = base[2] + u[2] * ox + v[2] * oy
        deform, edge = skin.at((px, py, pz)) if not isinstance(skin, int) else (skin, 1.0)
        ring.append(add_v(model, (px, py, pz), nrm(px - base[0], py - base[1], pz - base[2]), uv_cell(uv_name, i / segs, 1.0), deform, edge))
    for i in range(segs):
        add_tri(idxs, tip_i, ring[i], ring[(i + 1) % segs])
    return ring


# ---------- clothing pieces ----------
def add_knife_pleat_skirt(model, extra, skin):
    """JK knife-pleat: short, sharp folds, matches original waist radius."""
    waist_y, hem_y = 7.52, 5.48
    rw, rh = 1.50, 2.28
    pleats, rings = 36, 7
    # peak / valley / peak... valley is tucked, both faces stay white fabric
    cols = []
    for i in range(pleats):
        cols.append((2 * math.pi * i / pleats, 1.00, "white"))
        cols.append((2 * math.pi * (i + 0.22) / pleats, 0.70, "white"))
    n = len(cols)
    out_i, hem_i, waist_i = [], [], []
    grid = []
    for ri in range(rings):
        t = ri / (rings - 1)
        y = waist_y * (1 - t) + hem_y * t
        rt = rw * (1 - t) + rh * t
        row = []
        for ci, (a, scale, uname) in enumerate(cols):
            r = rt * scale
            p = ring_pt(a, y, r)
            nx, nz = math.sin(a), -math.cos(a)
            uv = uv_cell(uname, (ci / n) * 4 % 1, t)
            deform, edge = skin.at(p)
            row.append(add_v(model, p, nrm(nx, 0.22, nz), uv, deform, edge))
        grid.append(row)
    for ri in range(rings - 1):
        for ci in range(n):
            cj = (ci + 1) % n
            a, b = grid[ri][ci], grid[ri][cj]
            c, d = grid[ri + 1][ci], grid[ri + 1][cj]
            add_tri(out_i, a, c, d)
            add_tri(out_i, a, d, b)
    append_material(model, "JKPleatOut", extra, out_i)
    add_lathe(model, hem_i, [(hem_y + 0.04, rh * 0.98), (hem_y - 0.10, rh * 1.05), (hem_y - 0.14, rh * 1.02)], 64, "navyhem", skin)
    append_material(model, "JKHemTape", extra, hem_i)
    add_lathe(model, waist_i, [(waist_y + 0.10, rw * 0.96), (waist_y - 0.04, rw * 1.02)], 48, "navy", skin)
    append_material(model, "JKWaist", extra, waist_i)


def add_hem_ruffle(model, extra, uv_name, hem_y, radius, skin, waves=16):
    idxs = []
    profile = [
        (hem_y + 0.10, radius * 0.97),
        (hem_y - 0.02, radius * 1.08),
        (hem_y - 0.16, radius * 1.16),
        (hem_y - 0.26, radius * 1.10),
        (hem_y - 0.30, radius * 1.04),
    ]
    add_lathe(model, idxs, profile, 64, uv_name, skin, wave=0.045, waves=waves)
    append_material(model, "HemRuffle", extra, idxs)


def add_sailor_collar(model, extra, skin):
    """Front V + neck wrap in PMX -Z (face), square flap on the back."""
    navy, stripe, knot = [], [], []
    # neck wrap
    add_lathe(
        model,
        navy,
        [(10.42, 0.78), (10.72, 1.05), (10.98, 0.88)],
        28,
        "navy",
        skin,
        a0=-2.5,
        a1=2.5,
    )
    # back square flap (+Z)
    rows, cols = 7, 7
    grid = []
    for i in range(rows):
        ty = i / (rows - 1)
        y = 10.78 - ty * 1.45
        z = 0.35 + ty * 1.05
        w = 0.62 + ty * 0.78
        row = []
        for j in range(cols):
            tx = j / (cols - 1)
            x = -w + 2 * w * tx
            p = (x, y, z)
            deform, edge = skin.at(p)
            row.append(add_v(model, p, nrm(0, 0.25, 1), uv_cell("sailor", tx, ty), deform, edge))
        grid.append(row)
    add_grid(navy, grid)
    # large front V, face is -Z
    for sign in (-1, 1):
        corners = [
            (sign * 0.10, 10.85, -0.55),
            (sign * 1.22, 10.78, -0.15),
            (sign * 1.45, 9.15, -1.12),
            (sign * 0.08, 9.35, -1.28),
        ]
        vs = []
        for k, p in enumerate(corners):
            deform, edge = skin.at(p)
            vs.append(add_v(model, p, nrm(sign * 0.25, 0.15, -0.95), uv_cell("navy", k % 2, k // 2), deform, edge))
        add_tri(navy, vs[0], vs[1], vs[2])
        add_tri(navy, vs[0], vs[2], vs[3])
        inner = [
            (sign * 0.22, 10.62, -0.62),
            (sign * 1.02, 10.56, -0.22),
            (sign * 1.22, 9.35, -1.08),
            (sign * 0.20, 9.50, -1.20),
        ]
        vis = []
        for k, p in enumerate(inner):
            deform, edge = skin.at(p)
            vis.append(add_v(model, p, nrm(sign * 0.25, 0.15, -0.95), uv_cell("sailor", k % 2, k // 2), deform, edge))
        add_tri(stripe, vis[0], vis[1], vis[2])
        add_tri(stripe, vis[0], vis[2], vis[3])
    bow = [
        (-0.34, 10.28, -1.18),
        (0.34, 10.28, -1.18),
        (0.42, 8.55, -1.38),
        (-0.42, 8.55, -1.38),
    ]
    bvs = []
    for k, p in enumerate(bow):
        deform, edge = skin.at(p)
        bvs.append(add_v(model, p, nrm(0, 0.05, -1), uv_cell("navy", k % 2, k // 2), deform, edge))
    add_tri(navy, bvs[0], bvs[1], bvs[2])
    add_tri(navy, bvs[0], bvs[2], bvs[3])
    add_sphere(model, knot, (0.0, 10.12, -1.24), 0.16, 10, "white", skin, squash=(1.2, 0.85, 0.7))
    append_material(model, "SailorCollar", extra, navy)
    append_material(model, "SailorLine", extra, stripe)
    append_material(model, "SailorKnot", extra, knot)


def add_headband(model, extra, skin):
    navy, white = [], []
    segs = 22
    # sits on hair, slightly in front
    y0, y1 = 14.88, 15.18
    r0, r1 = 1.32, 1.26
    z_off = -0.55
    arc = 0.82
    nseg = segs
    span = 2 * math.pi * arc
    start = -span / 2

    def ring(y, r, uname, v):
        row = []
        for i in range(nseg + 1):
            t = i / nseg
            a = start + span * t + math.pi  # front is -Z, rotate
            x = math.cos(a) * r
            z = math.sin(a) * r + z_off
            p = (x, y, z)
            deform, edge = skin.at(p) if not isinstance(skin, int) else (HEAD, 1.0)
            # force head bone so it turns with the head
            row.append(add_v(model, p, nrm(x, 0.2, z - z_off), uv_cell(uname, t, v), HEAD, 1.0))
        return row

    g = [ring(y0, r0, "navy", 0.0), ring(y1, r1, "navy", 1.0)]
    add_grid(navy, g)
    g2 = [ring(y0 + 0.07, r0 + 0.03, "stripe", 0.0), ring(y1 - 0.07, r1 + 0.03, "stripe", 1.0)]
    add_grid(white, g2)
    append_material(model, "Headband", extra, navy)
    append_material(model, "HeadbandStripe", extra, white)


def add_cat_ears(model, extra):
    outer, inner = [], []
    segs = 14

    def ear(idxs, uv_name, side, profile):
        rows = []
        for pi, (y, rad, x0, z0) in enumerate(profile):
            row = []
            v = pi / max(1, len(profile) - 1)
            for j in range(segs):
                a = 2 * math.pi * j / segs
                x = x0 + math.cos(a) * rad * 0.72
                z = z0 + math.sin(a) * rad
                p = (x, y, z)
                row.append(add_v(model, p, nrm(x - x0, 0.25, z - z0), uv_cell(uv_name, j / segs, v), HEAD))
            rows.append(row)
        add_grid(idxs, rows)

    for s in (-1, 1):
        ear(
            outer,
            "pink",
            s,
            [
                (15.55, 0.42, s * 0.82, -0.28),
                (16.05, 0.32, s * 0.98, -0.22),
                (16.60, 0.20, s * 1.12, -0.16),
                (17.15, 0.10, s * 1.22, -0.10),
                (17.58, 0.02, s * 1.28, -0.06),
            ],
        )
        ear(
            inner,
            "inner",
            s,
            [
                (15.68, 0.20, s * 0.82, -0.42),
                (16.20, 0.14, s * 0.96, -0.36),
                (16.75, 0.08, s * 1.10, -0.30),
                (17.15, 0.02, s * 1.18, -0.26),
            ],
        )
    append_material(model, "CatEar", extra, outer)
    append_material(model, "CatEarIn", extra, inner)


def add_bow(model, extra, center, scale, uv_name, bone, idxs=None):
    own = idxs is None
    idxs = [] if own else idxs
    cx, cy, cz = center
    add_sphere(model, idxs, center, 0.14 * scale, 10, uv_name, bone, squash=(1.0, 0.85, 0.7))
    add_sphere(model, idxs, (cx - 0.38 * scale, cy + 0.04 * scale, cz), 0.32 * scale, 10, uv_name, bone, squash=(1.35, 0.85, 0.45))
    add_sphere(model, idxs, (cx + 0.38 * scale, cy - 0.02 * scale, cz), 0.32 * scale, 10, uv_name, bone, squash=(1.35, 0.85, 0.45))
    # tails
    for sign, drop in ((-1, 0.85), (1, 0.70)):
        corners = [
            (cx - 0.08 * scale, cy - 0.12 * scale, cz),
            (cx + 0.08 * scale, cy - 0.12 * scale, cz),
            (cx + sign * 0.22 * scale, cy - drop * scale, cz + 0.12 * scale),
            (cx + sign * 0.02 * scale, cy - drop * scale, cz + 0.12 * scale),
        ]
        vs = [add_v(model, p, nrm(0, 0, -1), uv_cell(uv_name, 0.5, 0.5), bone) for p in corners]
        add_tri(idxs, vs[0], vs[1], vs[2])
        add_tri(idxs, vs[0], vs[2], vs[3])
    if own:
        return idxs
    return idxs


def add_head_bow(model, extra, color="plaid"):
    idxs = add_bow(model, extra, (1.05, 15.22, -0.18), 1.0, color, HEAD)
    append_material(model, "HeadBow", extra, idxs)


def add_hip_bows(model, extra, color="plaid", skin=None):
    idxs = []
    for s in (-1, 1):
        c = (s * 3.20, 5.85, 0.35)
        add_bow(model, extra, c, 1.20, color, HIP if skin is None else skin, idxs)
    append_material(model, "HipBow", extra, idxs)


def add_stars(model, extra, y, r, count=8, skin=None):
    idxs = []
    skin = skin if skin is not None else HIP
    for i in range(count):
        a = 2 * math.pi * (i + 0.5) / count
        cx, cy, cz = ring_pt(a, y, r)
        # 4-point star as two quads
        pts = []
        for k in range(8):
            ang = a + math.pi * k / 4
            rad = 0.16 if k % 2 == 0 else 0.07
            px = cx + math.sin(ang) * rad
            pz = cz - math.cos(ang) * rad
            p = (px, cy, pz)
            deform, edge = skin.at(p) if not isinstance(skin, int) else (skin, 1.0)
            pts.append(add_v(model, p, nrm(math.sin(a), 0.1, -math.cos(a)), uv_cell("white", 0.5, 0.5), deform, edge))
        c = add_v(model, (cx, cy + 0.02, cz), nrm(math.sin(a), 0.2, -math.cos(a)), uv_cell("white", 0.5, 0.5), (skin.at((cx, cy, cz))[0] if not isinstance(skin, int) else skin))
        for k in range(8):
            add_tri(idxs, c, pts[k], pts[(k + 1) % 8])
    append_material(model, "SkirtStars", extra, idxs)


def add_apron(model, extra, skin):
    """Curved bib + skirt apron wrapping the front."""
    idxs = []
    rows, cols = 10, 14
    grid = []
    for i in range(rows):
        ty = i / (rows - 1)
        # bib then skirt
        if ty < 0.42:
            y = 9.95 - ty / 0.42 * 1.90
            half = 0.82 + ty * 0.22
            r = 1.28
        else:
            t2 = (ty - 0.42) / 0.58
            y = 8.05 - t2 * 2.55
            half = 1.05 + t2 * 1.25
            r = 1.35 + t2 * 1.45
        row = []
        for j in range(cols):
            tx = j / (cols - 1)
            a = -0.95 + 1.90 * tx  # front arc
            x = math.sin(a) * r
            z = -math.cos(a) * r - 0.08
            # clip to front width
            x = max(-half, min(half, x))
            p = (x, y, z)
            deform, edge = skin.at(p)
            row.append(add_v(model, p, nrm(math.sin(a), 0.08, -math.cos(a)), uv_cell("lace", tx, ty), deform, edge))
        grid.append(row)
    add_grid(idxs, grid)
    # waist sash
    sash = []
    add_lathe(model, sash, [(7.95, 1.28), (7.72, 1.32)], 36, "white", skin, a0=-1.2, a1=1.2)
    idxs.extend(sash)
    append_material(model, "Apron", extra, idxs)


def add_maid_crown(model, extra):
    white, black = [], []
    segs = 20
    y0, y1 = 14.95, 15.28
    r = 1.28
    z_off = -0.62
    arc = 0.80
    nseg = segs
    span = 2 * math.pi * arc
    start = -span / 2 + math.pi

    def ring(y, rr, uname, v):
        row = []
        for i in range(nseg + 1):
            t = i / nseg
            a = start + span * t
            x = math.cos(a) * rr
            z = math.sin(a) * rr + z_off
            row.append(add_v(model, (x, y, z), nrm(x, 0.25, z - z_off), uv_cell(uname, t, v), HEAD))
        return row

    g = [ring(y0, r, "white", 0), ring(y1, r - 0.04, "white", 1)]
    add_grid(white, g)
    # two wing flaps
    for s in (-1, 1):
        corners = [
            (s * 0.18, 15.18, -0.85),
            (s * 1.12, 15.05, -0.40),
            (s * 1.28, 15.95, -0.32),
            (s * 0.10, 16.15, -0.88),
        ]
        vs = [add_v(model, p, nrm(0, 0.4, -1), uv_cell("lace", 0.5, 0.5), HEAD) for p in corners]
        add_tri(white, vs[0], vs[1], vs[2])
        add_tri(white, vs[0], vs[2], vs[3])
    add_bow(model, extra, (0.0, 15.22, -1.05), 0.85, "black", HEAD, black)
    append_material(model, "MaidCrown", extra, white)
    append_material(model, "MaidBow", extra, black)


def add_santa_hat(model, extra):
    red, white = [], []
    segs = 20
    stacks = 8
    base = (0.0, 15.82, -0.12)
    tip = (0.58, 18.25, -0.72)
    br = 1.38
    grid = []
    for i in range(stacks + 1):
        t = i / stacks
        y = base[1] * (1 - t) + tip[1] * t
        x0 = base[0] * (1 - t) + tip[0] * t
        z0 = base[2] * (1 - t) + tip[2] * t
        r = br * (1 - t) ** 1.15 + 0.04
        row = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            x = x0 + math.cos(a) * r
            z = z0 + math.sin(a) * r
            row.append(add_v(model, (x, y, z), nrm(x - x0, 0.2, z - z0), uv_cell("red", j / segs, t), HEAD))
        grid.append(row)
    add_grid(red, grid)
    # fur brim
    brim = []
    add_lathe(
        model,
        brim,
        [(15.62, 1.32), (15.85, 1.42), (16.08, 1.32), (16.18, 1.12)],
        24,
        "fur",
        HEAD,
    )
    # the lathe uses ring_pt around origin; hat is on the head which is near origin XZ, OK
    white.extend(brim)
    add_sphere(model, white, (0.70, 18.40, -0.82), 0.30, 12, "fur", HEAD)
    append_material(model, "SantaHat", extra, red)
    append_material(model, "SantaFur", extra, white)


def add_fur_collar(model, extra, skin):
    idxs = []
    add_lathe(model, idxs, [(10.55, 0.78), (10.85, 0.92), (11.05, 0.70)], 24, "fur", skin, a0=-2.4, a1=2.4)
    append_material(model, "FurCollar", extra, idxs)


def add_neck_ribbon(model, extra, skin, color="black"):
    idxs = []
    add_bow(model, extra, (0.0, 10.12, -1.18), 0.78, color, UPPER, idxs)
    append_material(model, "NeckRibbon", extra, idxs)


# ---------- textures ----------
def _cell_box(col, row, size):
    return col * size, row * size, (col + 1) * size, (row + 1) * size


def _fill_noise(im, box, color, amp=12):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    arr = np.zeros((h, w, 4), np.uint8)
    c = np.array(color, dtype=np.int16)
    rng = np.random.default_rng(col_seed(color))
    n = rng.integers(-amp, amp + 1, size=(h, w, 1), dtype=np.int16)
    # soft vertical fold
    gy = np.linspace(-amp // 2, amp // 2, h, dtype=np.int16).reshape(h, 1, 1)
    rgb = np.clip(c[:3] + n + gy, 0, 255).astype(np.uint8)
    a = np.full((h, w, 1), c[3] if len(c) > 3 else 255, np.uint8)
    arr = np.concatenate([rgb, a], axis=2)
    tile = Image.fromarray(arr, "RGBA")
    im.paste(tile, (x0, y0))


def col_seed(color):
    return abs(hash(tuple(color))) % (2**31)


def _stripes(im, box, bg, fg, n=2, thick=0.12, gap=0.18, y0=0.22):
    _fill_noise(im, box, bg, 8)
    d = ImageDraw.Draw(im)
    x0, y0b, x1, y1 = box
    h = y1 - y0b
    for i in range(n):
        yy = y0b + int(h * (y0 + i * (thick + gap)))
        d.rectangle([x0 + 4, yy, x1 - 5, yy + int(h * thick)], fill=tuple(fg))


def _plaid(im, box, bg, line):
    _fill_noise(im, box, bg, 10)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box
    step = 18
    for x in range(x0 + 6, x1, step):
        d.rectangle([x, y0, x + 3, y1], fill=tuple(line))
    for y in range(y0 + 6, y1, step):
        d.rectangle([x0, y, x1, y + 3], fill=tuple(line))
    for x in range(x0 + 15, x1, step):
        d.rectangle([x, y0, x + 1, y1], fill=(245, 245, 245, 160))


def _lace(im, box):
    _fill_noise(im, box, (248, 244, 236, 255), 6)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box
    # scallop along bottom
    for x in range(x0, x1, 18):
        d.ellipse([x, y1 - 22, x + 18, y1 + 4], outline=(230, 220, 210, 255), width=2)
    for y in range(y0 + 10, y1 - 20, 16):
        for x in range(x0 + 10, x1 - 8, 16):
            d.ellipse([x, y, x + 4, y + 4], fill=(236, 228, 218, 255))


def _fur(im, box):
    _fill_noise(im, box, (244, 240, 232, 255), 18)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box
    rng = np.random.default_rng(7)
    for _ in range(80):
        x = int(rng.integers(x0, x1))
        y = int(rng.integers(y0, y1))
        d.ellipse([x, y, x + int(rng.integers(4, 10)), y + int(rng.integers(6, 14))], fill=(255, 252, 246, 180))


def _stars(im, box):
    _fill_noise(im, box, (28, 78, 42, 255), 8)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1 = box

    def star(cx, cy, r):
        pts = []
        for k in range(8):
            ang = -math.pi / 2 + math.pi * k / 4
            rad = r if k % 2 == 0 else r * 0.38
            pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
        d.polygon(pts, fill=(248, 248, 242, 255))

    for i in range(3):
        for j in range(3):
            star(x0 + 40 + j * 72, y0 + 40 + i * 72, 16)


def write_extra_png(path: Path):
    size = 256
    im = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    paints = {
        "white": lambda b: _fill_noise(im, b, (245, 242, 232, 255), 10),
        "navy": lambda b: _fill_noise(im, b, (30, 48, 96, 255), 8),
        "sailor": lambda b: _stripes(im, b, (30, 48, 96, 255), (245, 242, 232, 255), 2, 0.13, 0.16, 0.28),
        "gold": lambda b: _fill_noise(im, b, (220, 176, 96, 255), 8),
        "red": lambda b: _fill_noise(im, b, (186, 42, 48, 255), 10),
        "green": lambda b: _fill_noise(im, b, (32, 92, 48, 255), 8),
        "black": lambda b: _fill_noise(im, b, (28, 26, 32, 255), 6),
        "pink": lambda b: _fill_noise(im, b, (244, 176, 196, 255), 8),
        "plaid": lambda b: _plaid(im, b, (46, 122, 64, 255), (232, 240, 220, 255)),
        "lace": lambda b: _lace(im, b),
        "inner": lambda b: _fill_noise(im, b, (255, 214, 224, 255), 6),
        "fur": lambda b: _fur(im, b),
        "navyhem": lambda b: _stripes(im, b, (30, 48, 96, 255), (220, 176, 96, 255), 1, 0.10, 0.0, 0.55),
        "stargreen": lambda b: _stars(im, b),
        "stripe": lambda b: _stripes(im, b, (245, 242, 232, 255), (30, 48, 96, 255), 2, 0.10, 0.18, 0.3),
        "brown": lambda b: _fill_noise(im, b, (92, 64, 42, 255), 8),
    }
    for name, (c, r) in CELL.items():
        paints[name](_cell_box(c, r, size))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path)


def recolor_cloth(src: Path, dest: Path, spec: dict):
    im = Image.open(src).convert("RGBA")
    arr = np.asarray(im).astype(np.float32) / 255.0
    rgb, a = arr[..., :3], arr[..., 3]
    h, s, v = rgb_to_hsv(rgb)
    hh, ss, vv = h.copy(), s.copy(), v.copy()
    navy = (h > 0.50) & (h < 0.78) & (s > 0.15) & (v > 0.07) & (v < 0.70) & (a > 0.2)
    gold = (h > 0.09) & (h < 0.16) & (s > 0.38) & (v > 0.42) & (v < 0.90) & (a > 0.2)
    red = (((h < 0.04) | (h > 0.96)) & (s > 0.45) & (v > 0.25) & (v < 0.85) & (a > 0.2))
    for mask, key in ((navy, "navy"), (gold, "gold"), (red, "red")):
        pal = spec.get(key)
        if not pal:
            continue
        if "h" in pal:
            hh[mask] = pal["h"]
        if "sat_mul" in pal:
            ss[mask] = np.clip(s[mask] * pal["sat_mul"], 0, 1)
        elif "s" in pal:
            ss[mask] = pal["s"]
        if "val_mul" in pal:
            vv[mask] = np.clip(v[mask] * pal["val_mul"], 0, 1)
        elif "v" in pal:
            vv[mask] = pal["v"]
    out = np.dstack([np.clip(hsv_to_rgb(hh, ss, vv), 0, 1), a])
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((out * 255).astype(np.uint8), "RGBA").save(dest)


def prepare_shared():
    SHARED.mkdir(parents=True, exist_ok=True)
    for name in ("hair.png", "face.png", "BiaoQing01.png", "BiaoQing02.png", "BiaoQing03.png", "BiaoQing04.png"):
        dst = SHARED / name
        if not dst.exists() or dst.stat().st_mtime < (SRC_TEX / name).stat().st_mtime:
            shutil.copyfile(SRC_TEX / name, dst)


def retarget_textures(model, extra_src: Path, dest_dir: Path, cloth_src: Path):
    tex_dir = dest_dir / "tex"
    tex_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(cloth_src, tex_dir / "cloth.png")
    shutil.copyfile(extra_src, tex_dir / "extra.png")
    model.textures = [
        "tex/cloth.png",
        "../_shared/hair.png",
        "../_shared/face.png",
        "../_shared/BiaoQing01.png",
        "../_shared/BiaoQing04.png",
        "../_shared/BiaoQing02.png",
        "../_shared/BiaoQing03.png",
        "tex/extra.png",
    ]
    return 7


# ---------- outfit builds ----------
PAL = {
    "nurse": {
        "navy": {"h": 0.10, "s": 0.05, "v": 0.93},
        "gold": {"h": 0.62, "s": 0.48, "v": 0.38},
        "red": {"h": 0.62, "s": 0.55, "v": 0.32},
    },
    "outing": {
        "navy": {"h": 0.36, "s": 0.58, "v": 0.22},
        "gold": {"h": 0.12, "s": 0.08, "v": 0.92},
        "red": {"h": 0.12, "s": 0.06, "v": 0.94},
    },
    "maid": {
        "navy": {"h": 0.66, "s": 0.12, "v": 0.10},
        "gold": {"h": 0.10, "s": 0.06, "v": 0.92},
        "red": {"h": 0.10, "s": 0.05, "v": 0.93},
    },
    "xmas": {
        "navy": {"h": 0.00, "s": 0.72, "v": 0.52},
        "gold": {"h": 0.12, "s": 0.08, "v": 0.94},
        "red": {"h": 0.00, "s": 0.15, "v": 0.92},
    },
}


def build_nurse(m, extra, cloth_skin, skirt_skin, head_skin):
    strip_materials(m, SKIRT_MATS)
    add_knife_pleat_skirt(m, extra, skirt_skin)
    add_sailor_collar(m, extra, cloth_skin)
    add_headband(m, extra, head_skin)


def build_outing(m, extra, cloth_skin, skirt_skin, head_skin):
    reshape_skirt_lolita(m)
    add_hem_ruffle(m, extra, "lace", 4.92, 3.42, skirt_skin)
    add_cat_ears(m, extra)
    add_head_bow(m, extra, "plaid")
    add_hip_bows(m, extra, "plaid", skirt_skin)
    add_stars(m, extra, 5.70, 3.35, 8, skirt_skin)
    add_neck_ribbon(m, extra, cloth_skin, "black")


def build_maid(m, extra, cloth_skin, skirt_skin, head_skin):
    reshape_skirt_lolita(m)
    add_hem_ruffle(m, extra, "lace", 4.92, 3.42, skirt_skin)
    add_apron(m, extra, cloth_skin)
    add_maid_crown(m, extra)
    add_neck_ribbon(m, extra, cloth_skin, "black")


def build_xmas(m, extra, cloth_skin, skirt_skin, head_skin):
    reshape_skirt_lolita(m)
    add_hem_ruffle(m, extra, "fur", 4.92, 3.40, skirt_skin)
    add_santa_hat(m, extra)
    add_fur_collar(m, extra, cloth_skin)


OUTFITS = [
    {"id": "nurse", "title": "JK水手服", "build": build_nurse},
    {"id": "outing", "title": "JSK郊游裙", "build": build_outing},
    {"id": "maid", "title": "洛丽塔女仆", "build": build_maid},
    {"id": "xmas", "title": "洛丽塔圣诞", "build": build_xmas},
]


def main():
    print("reading", SRC_PMX)
    base = read_from_file(str(SRC_PMX))
    prepare_shared()
    extra_png = SHARED / "extra.png"
    write_extra_png(extra_png)
    print("wrote extra atlas", extra_png)

    for spec in OUTFITS:
        print("building", spec["title"])
        m = copy.deepcopy(base)
        m.name = f"Taffy_{spec['id']}"
        m.english_name = spec["title"]
        m.comment = (m.comment or "") + f"\noutfit {spec['title']}"
        dest = OUT_ROOT / spec["id"]
        dest.mkdir(parents=True, exist_ok=True)
        cloth_png = dest / "tex" / "_cloth_src.png"
        recolor_cloth(SRC_TEX / "cloth.png", cloth_png, PAL[spec["id"]])
        extra_i = retarget_textures(m, extra_png, dest, cloth_png)
        cloth_png.unlink(missing_ok=True)
        strip_materials(m, INVENTOR_EXTRAS)
        cloth_ids = mat_vertex_ids(m, ["Cloth", "Body"])
        skirt_ids = mat_vertex_ids(m, SKIRT_MATS)
        if not skirt_ids:
            skirt_ids = cloth_ids
        cloth_skin = NearestSkin(m, cloth_ids)
        skirt_skin = NearestSkin(m, skirt_ids)
        head_skin = HEAD
        spec["build"](m, extra_i, cloth_skin, skirt_skin, head_skin)
        total = sum(mat.vertex_count for mat in m.materials)
        assert total == len(m.indices), f"index mismatch {total} vs {len(m.indices)}"
        out_pmx = dest / "taffy.pmx"
        write_to_file(m, str(out_pmx))
        extras = [mat for mat in m.materials if mat.texture_index == extra_i and mat.vertex_count]
        print(
            "  wrote",
            out_pmx,
            "verts",
            len(m.vertices),
            "extra faces",
            sum(mat.vertex_count for mat in extras) // 3,
            "bytes",
            out_pmx.stat().st_size,
        )


if __name__ == "__main__":
    main()
