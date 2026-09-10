"""Dump PMX 2.0 bones and materials for outfit attachment."""
from pathlib import Path
import struct

PMX = Path(r"C:\Users\admin\Desktop\塔菲桌宠\models\taffy1883\taffy.pmx")


class R:
    def __init__(self, data):
        self.d = data
        self.i = 0

    def u8(self):
        v = self.d[self.i]
        self.i += 1
        return v

    def i16(self):
        v = struct.unpack_from("<h", self.d, self.i)[0]
        self.i += 2
        return v

    def i32(self):
        v = struct.unpack_from("<i", self.d, self.i)[0]
        self.i += 4
        return v

    def f32(self):
        v = struct.unpack_from("<f", self.d, self.i)[0]
        self.i += 4
        return v

    def vec3(self):
        return (self.f32(), self.f32(), self.f32())

    def vec2(self):
        return (self.f32(), self.f32())

    def vec4(self):
        return (self.f32(), self.f32(), self.f32(), self.f32())

    def idx(self, size):
        if size == 1:
            v = self.d[self.i]
            self.i += 1
            return v if v != 255 else -1
        if size == 2:
            v = struct.unpack_from("<H", self.d, self.i)[0]
            self.i += 2
            return v if v != 65535 else -1
        v = struct.unpack_from("<i", self.d, self.i)[0]
        self.i += 4
        return v

    def text(self, utf8):
        n = self.i32()
        raw = self.d[self.i : self.i + n]
        self.i += n
        return raw.decode("utf-8" if utf8 else "utf-16le", errors="replace")


def main():
    r = R(PMX.read_bytes())
    magic = r.d[0:4]
    r.i = 4
    ver = r.f32()
    glob_n = r.u8()
    globs = list(r.d[r.i : r.i + glob_n])
    r.i += glob_n
    utf8 = globs[0] == 1
    add_uv = globs[1]
    vsz, tsz, msz, bsz, zsz, rsz = globs[2:8]
    print("ver", ver, "utf8", utf8, "add_uv", add_uv, "idx", globs[2:8])
    print("name", r.text(utf8), r.text(utf8))
    print("comment", r.text(utf8)[:80], "/", r.text(utf8)[:80])

    nv = r.i32()
    print("vertices", nv)
    positions = []
    for _ in range(nv):
        p = r.vec3()
        positions.append(p)
        r.vec3()  # normal
        r.vec2()  # uv
        for _u in range(add_uv):
            r.vec4()
        dt = r.u8()
        if dt == 0:
            r.idx(bsz)
        elif dt == 1:
            r.idx(bsz)
            r.idx(bsz)
            r.f32()
        elif dt == 2:
            for __ in range(4):
                r.idx(bsz)
            for __ in range(4):
                r.f32()
        elif dt == 3:  # SDEF
            r.idx(bsz)
            r.idx(bsz)
            r.f32()
            r.vec3()
            r.vec3()
            r.vec3()
        elif dt == 4:  # QDEF
            for __ in range(4):
                r.idx(bsz)
            for __ in range(4):
                r.f32()
        else:
            raise RuntimeError(f"unknown weight type {dt} at {r.i}")
        r.f32()  # edge

    nf = r.i32()
    print("faces indices", nf)
    faces = [r.idx(vsz) for _ in range(nf)]

    nt = r.i32()
    print("textures", nt)
    texs = [r.text(utf8) for _ in range(nt)]
    for i, t in enumerate(texs):
        print(f"  tex {i}: {t}")

    nm = r.i32()
    print("materials", nm, "offset", r.i)
    cursor = 0
    for i in range(nm):
        start = r.i
        name = r.text(utf8)
        name_en = r.text(utf8)
        diffuse = r.vec4()
        spec = r.vec3()
        spec_pow = r.f32()
        amb = r.vec3()
        flag = r.u8()
        edge_c = r.vec4()
        edge_sz = r.f32()
        tex = r.idx(tsz)
        env = r.idx(tsz)
        env_flag = r.u8()
        toon_flag = r.u8()
        if toon_flag == 0:
            toon = r.idx(tsz)
        else:
            toon = r.u8()
        memo = r.text(utf8)
        print(f"  parse mat {i} start={start} name={name!r} tex={tex} env={env} envf={env_flag} toonf={toon_flag} toon={toon} next={r.i}")
        count = r.i32()
        idxs = faces[cursor : cursor + count]
        cursor += count
        xs = [positions[j][0] for j in idxs]
        ys = [positions[j][1] for j in idxs]
        zs = [positions[j][2] for j in idxs]
        print(
            f"  mat {i}: {name} | tex={tex}({texs[tex] if 0<=tex<len(texs) else '?'}) "
            f"faces={count//3} y=[{min(ys):.2f},{max(ys):.2f}] "
            f"x=[{min(xs):.2f},{max(xs):.2f}] z=[{min(zs):.2f},{max(zs):.2f}]"
        )

    nb = r.i32()
    print("bones", nb)
    for i in range(nb):
        name = r.text(utf8)
        name_en = r.text(utf8)
        pos = r.vec3()
        parent = r.idx(bsz)
        layer = r.i32()
        flags = r.i16()
        if flags & 0x0001:
            r.idx(bsz)
        else:
            r.vec3()
        if flags & 0x0100 or flags & 0x0200:
            r.idx(bsz)
            r.f32()
        if flags & 0x0400:
            r.vec3()
        if flags & 0x0800:
            r.vec3()
            r.vec3()
        if flags & 0x2000:
            r.i32()
        if flags & 0x0020:
            r.idx(bsz)
            r.idx(bsz)
            r.vec3()
            nlink = r.i32()
            for _ in range(nlink):
                b = r.idx(bsz)
                if b >= 0:
                    r.vec3()
        keys = ("頭", "首", "上半身", "下半身", "肩", "腕", "スカート", "胸", "腰", "センター", "メガネ", "リボン", "髪")
        if any(k in name for k in keys):
            print(f"  bone {i}: {name} parent={parent} pos=({pos[0]:.3f},{pos[1]:.3f},{pos[2]:.3f})")


if __name__ == "__main__":
    main()
