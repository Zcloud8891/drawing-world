// Turn a flat cutout into a puffy, plush-like 3D body: the silhouette's distance field is "inflated"
// into a two-sided mesh with the drawing projected on front and back. Runs in a few ms on a phone.
import * as THREE from './vendor/three.module.js';

const G = 72, T = 288;

/** cutout canvas -> { geo, texCanvas, height, width } in units where the square texture is 1 wide */
export function inflate(cut) {
  const sq = document.createElement('canvas'); sq.width = sq.height = T;
  const k = (T - 8) / Math.max(cut.width, cut.height), dw = cut.width * k, dh = cut.height * k;
  const ctx = sq.getContext('2d', { willReadFrequently: true });
  const ox = (T - dw) / 2, oy = T - 4 - dh;
  // bleed edge colours outward so linear filtering doesn't paint a dark fringe at the silhouette
  for (const r of [6, 4, 2]) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) ctx.drawImage(cut, ox + dx, oy + dy, dw, dh);
  ctx.drawImage(cut, ox, oy, dw, dh);
  const spread = ctx.getImageData(0, 0, T, T);
  ctx.clearRect(0, 0, T, T); ctx.drawImage(cut, ox, oy, dw, dh);
  const plain = ctx.getImageData(0, 0, T, T), a = plain.data;
  for (let p = 0; p < a.length; p += 4) if (a[p + 3] < 250) { a[p] = spread.data[p]; a[p + 1] = spread.data[p + 1]; a[p + 2] = spread.data[p + 2]; }
  ctx.putImageData(plain, 0, 0);
  const V = G + 1, inside = new Uint8Array(V * V);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const px = Math.min(T - 1, Math.round(i / G * (T - 1))), py = Math.min(T - 1, Math.round(j / G * (T - 1)));
    inside[j * V + i] = a[(py * T + px) * 4 + 3] > 128 ? 1 : 0;
  }
  // two-pass chamfer distance (grid units) to the outside
  const d = new Float32Array(V * V); for (let q = 0; q < V * V; q++) d[q] = inside[q] ? 1e6 : 0;
  const S = Math.SQRT2;
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const q = j * V + i; if (!d[q]) continue; let m = d[q];
    m = Math.min(m, i > 0 ? d[q - 1] + 1 : 1);
    if (j > 0) { m = Math.min(m, d[q - V] + 1); if (i > 0) m = Math.min(m, d[q - V - 1] + S); if (i < G) m = Math.min(m, d[q - V + 1] + S); } else m = Math.min(m, 1);
    d[q] = m;
  }
  for (let j = G; j >= 0; j--) for (let i = G; i >= 0; i--) {
    const q = j * V + i; if (!d[q]) continue; let m = d[q];
    m = Math.min(m, i < G ? d[q + 1] + 1 : 1);
    if (j < G) { m = Math.min(m, d[q + V] + 1); if (i < G) m = Math.min(m, d[q + V + 1] + S); if (i > 0) m = Math.min(m, d[q + V - 1] + S); } else m = Math.min(m, 1);
    d[q] = m;
  }
  let dmax = 0; for (let q = 0; q < V * V; q++) dmax = Math.max(dmax, d[q]); dmax /= G;
  const cap = Math.min(dmax, 0.22);
  let z = new Float32Array(V * V);
  for (let q = 0; q < V * V; q++) { const du = Math.max(0, d[q] - 0.5) / G; z[q] = 0.7 * Math.sqrt(du * cap); }
  for (let pass = 0; pass < 2; pass++) {
    const z2 = z.slice();
    for (let j = 1; j < G; j++) for (let i = 1; i < G; i++) { const q = j * V + i; if (inside[q]) z2[q] = (z[q] * 4 + z[q - 1] + z[q + 1] + z[q - V] + z[q + V]) / 8; }
    z = z2;
  }
  const used = new Uint8Array(G * G), vUse = new Int32Array(V * V).fill(-1);
  let lowJ = 0, minI = G, maxI = 0;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const q = j * V + i; if (inside[q] || inside[q + 1] || inside[q + V] || inside[q + V + 1]) used[j * G + i] = 1; }
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) if (inside[j * V + i]) { lowJ = Math.max(lowJ, j); minI = Math.min(minI, i); maxI = Math.max(maxI, i); }
  const pos = [], uv = [], zs = [], idx = []; let n = 0;
  const yOff = 1 - lowJ / G;
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (used[j * G + i]) for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const q = (j + dj) * V + i + di;
    if (vUse[q] < 0) { vUse[q] = n++; const u = (i + di) / G, v = (j + dj) / G; pos.push(u - 0.5, 1 - v - yOff, z[q]); uv.push(u, 1 - v); zs.push(z[q]); }
  }
  const front = n;
  for (let p = 0; p < front; p++) { pos.push(pos[p * 3], pos[p * 3 + 1], -zs[p]); uv.push(uv[p * 2], uv[p * 2 + 1]); }
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (used[j * G + i]) {
    const a0 = vUse[j * V + i], b0 = vUse[(j + 1) * V + i], c0 = vUse[j * V + i + 1], d0 = vUse[(j + 1) * V + i + 1];
    idx.push(a0, b0, c0, c0, b0, d0, a0 + front, c0 + front, b0 + front, c0 + front, d0 + front, b0 + front);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  let top = 0; for (let p = 1; p < pos.length; p += 3) top = Math.max(top, pos[p]);
  return { geo, texCanvas: sq, height: top, width: (maxI - minI) / G };
}
