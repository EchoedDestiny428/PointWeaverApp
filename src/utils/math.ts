import type { PathPoint } from '../types';

export const smoothstep = (x: number) => x * x * (3 - 2 * x);

export const findNextHeadingIndex = (points: PathPoint[], startIndex: number) => {
  let j = startIndex + 1;
  while (j < points.length) {
    if (points[j].theta != null) return j;
    j++;
  }
  return -1;
};

export const computeGroupTotals = (points: PathPoint[]) => {
  const n = points.length;
  const groupTotals = new Array(n).fill(NaN);
  if (n < 2) return groupTotals;

  const prefix = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    prefix[i] = prefix[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  let i = 0;
  while (i < n) {
    if (points[i].theta == null) { i++; continue; }
    let j = i + 1;
    while (j < n && points[j].theta == null) j++;
    if (j < n && points[j].theta != null) {
      const total = prefix[j] - prefix[i];
      if (total > 1e-9) {
        for (let k = i; k <= j; k++) groupTotals[k] = total;
      }
      i = j;
    } else {
      break;
    }
  }
  return groupTotals;
};

export const distToSegmentSquared = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  if (l2 === 0) return (x - x1) ** 2 + (y - y1) ** 2;
  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (x - (x1 + t * (x2 - x1))) ** 2 + (y - (y1 + t * (y2 - y1))) ** 2;
};
