function advanceWithinWorkArea(bounds, area, direction, distance) {
  const dir = direction < 0 ? -1 : 1;
  const step = Math.max(0, Number(distance) || 0) * dir;
  const minX = area.x;
  const maxX = area.x + Math.max(0, area.width - bounds.width);
  const x = Math.max(minX, Math.min(maxX, Math.round(bounds.x + step)));
  const hitEdge = (dir < 0 && x === minX) || (dir > 0 && x === maxX);
  // 距离下一面墙（沿行走方向）的像素数；用于渲染端的"边界感"头偏转
  const distToEdge = dir < 0 ? x - minX : maxX - x;
  return { x, movedX: x - bounds.x, direction: hitEdge ? -dir : dir, hitEdge, distToEdge };
}

module.exports = { advanceWithinWorkArea };
