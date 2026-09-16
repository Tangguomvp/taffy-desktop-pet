# -*- coding: utf-8 -*-
# 抠图：rembg 出初始 mask -> 连通域清理 -> 二值化硬化 -> 1~2px 羽化
# 硬化是为了去掉发丝半透明处透出的原背景灰雾
import os
import cv2
import numpy as np
from PIL import Image
from rembg import remove, new_session

SRC = r"C:\Users\admin\.dsh\attachments\v1\objects\e9\e9a28a2f67466a83f3509dd277e056a8114e13eb52ad47e2442f7fbb976144fd"
OUT = r"C:\Users\admin\Desktop\塔菲桌宠\tools\icon-work"
os.makedirs(OUT, exist_ok=True)


def imwrite_u(path, img):
    # cv2.imwrite 不认中文路径，用 imencode 兜一下
    ok, buf = cv2.imencode(".png", img)
    if ok:
        with open(path, "wb") as f:
            f.write(buf.tobytes())


def build_mask(rgba, thresh=25):
    a = np.array(rgba)[:, :, 3]
    _, binm = cv2.threshold(a, thresh, 255, cv2.THRESH_BINARY)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binm, 8)
    if n > 1:
        idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        keep = (labels == idx).astype(np.uint8) * 255
    else:
        keep = binm
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    ff = keep.copy()
    h, w = keep.shape
    m = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, m, (0, 0), 255)
    return cv2.bitwise_or(keep, cv2.bitwise_not(ff))


def harden(mask, core=128, sigma=1.0, lo=0.30, hi=0.70):
    core_m = (mask > core).astype(np.float32)
    b = cv2.GaussianBlur(core_m, (0, 0), sigma)
    b = np.clip((b - lo) / (hi - lo), 0, 1)
    return b


img = Image.open(SRC).convert("RGBA")
arr0 = np.array(img)
print("input:", img.size)

for tag, matting in (("matted", True), ("plain", False)):
    sess = new_session("isnet-general-use")
    if matting:
        cut = remove(img, session=sess, alpha_matting=True,
                     alpha_matting_foreground_threshold=250,
                     alpha_matting_background_threshold=15,
                     alpha_matting_erode_size=6)
    else:
        cut = remove(img, session=sess, post_process_mask=True)
    mask = build_mask(cut)
    imwrite_u(os.path.join(OUT, "mask-" + tag + ".png"), mask)

    for hard in (True, False):
        alpha = harden(mask) if hard else (np.array(cut)[:, :, 3].astype(np.float32) / 255.0)
        out = arr0.astype(np.float32).copy()
        out[:, :, 3] = np.clip(alpha, 0, 1) * 255
        name = "fx-" + tag + ("-hard" if hard else "-soft")
        p = os.path.join(OUT, name + ".png")
        Image.fromarray(out.astype(np.uint8), "RGBA").save(p)
        ys, xs = np.where(out[:, :, 3] > 16)
        print(f"{name}: {os.path.getsize(p)} bbox x={xs.min()} y={ys.min()} "
              f"w={xs.max()-xs.min()+1} h={ys.max()-ys.min()+1}")
