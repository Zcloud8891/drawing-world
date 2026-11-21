// Lift a crayon drawing off the paper, entirely in the browser.
// Port of the Python free-mode cutout: lighting-robust ink threshold, close, fill holes, open,
// keep the big pieces, crop. Works on phone photos with uneven lighting.

const MAXDIM = 800;

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (2 * r + 1);
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function maxFilter(src, w, h, r) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; const a = Math.max(0, x - r), b = Math.min(w - 1, x + r), row = y * w;
    for (let i = a; i <= b; i++) if (src[row + i] > m) m = src[row + i];
    tmp[row + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; const a = Math.max(0, y - r), b = Math.min(h - 1, y + r);
    for (let i = a; i <= b; i++) if (tmp[i * w + x] > m) m = tmp[i * w + x];
    out[y * w + x] = m;
  }
  return out;
}

// 3x3 cross structuring element, like scipy's default
function dilate(m, w, h, n) {
  for (let k = 0; k < n; k++) {
    const o = m.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (m[i]) continue;
      if ((x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (y > 0 && m[i - w]) || (y < h - 1 && m[i + w])) o[i] = 1;
    }
    m = o;
  }
  return m;
}
function erode(m, w, h, n) {
  for (let k = 0; k < n; k++) {
    const o = m.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!m[i]) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w]) o[i] = 0;
    }
    m = o;
  }
  return m;
}
function fillHoles(m, w, h) {
  const seen = new Uint8Array(w * h), st = [];
  const push = (i) => { if (!m[i] && !seen[i]) { seen[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const i = st.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  const o = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) o[i] = seen[i] ? 0 : 1;
  return o;
}
function label(m, w, h) {
  const lab = new Int32Array(w * h), sizes = [0]; let n = 0; const st = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    n++; let size = 0; lab[s] = n; st.push(s);
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i / w) | 0; size++;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1])
        if (j >= 0 && m[j] && !lab[j]) { lab[j] = n; st.push(j); }
    }
    sizes.push(size);
  }
  return { lab, sizes, n };
}

export function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That file isn't a picture I can read.")); };
    img.src = url;
  });
}

/** blob/file -> canvas (RGBA, transparent background, cropped to the drawing) */
export async function cutout(blob) {
  const img = await loadImage(blob);
  const k = Math.min(1, MAXDIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h), a = px.data, N = w * h;
  const gray = new Float32Array(N), sat = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = a[i * 4], g = a[i * 4 + 1], b = a[i * 4 + 2];
    gray[i] = (r + g + b) / 3; sat[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  // paper lighting estimate: big blur (≈ gaussian sigma 40 at 1024px) and a local max
  const sc = MAXDIM / 1024, R = Math.max(2, Math.round(23 * sc));
  let bg = boxBlur(gray, w, h, R); bg = boxBlur(bg, w, h, R); bg = boxBlur(bg, w, h, R);
  const mx = maxFilter(gray, w, h, Math.round(15 * sc));
  let m = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const paper = Math.max(bg[i], mx[i] * 0.9);
    m[i] = (paper - gray[i] > 28 || sat[i] > 45) ? 1 : 0;
  }
  m = erode(dilate(m, w, h, 4), w, h, 4);
  m = fillHoles(m, w, h);
  m = dilate(erode(m, w, h, 2), w, h, 2);
  const { lab, sizes, n } = label(m, w, h);
  if (!n) throw new Error("Couldn't find a drawing on the paper. Try a darker crayon or a closer photo.");
  const big = Math.max(...sizes.slice(1)), keep = new Uint8Array(n + 1);
  for (let i = 1; i <= n; i++) keep[i] = sizes[i] >= Math.max(big * 0.08, 200 * sc * sc) ? 1 : 0;
  m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = keep[lab[i]];
  m = dilate(m, w, h, 2);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error("Couldn't find a drawing on the paper. Try a darker crayon or a closer photo.");
  // reject "the whole photo is ink" (e.g. a photo of a room, not a drawing)
  let ink = 0; for (let i = 0; i < N; i++) ink += m[i];
  if (ink > N * 0.85) throw new Error("That looks like the whole photo, not a drawing. Try a drawing on plain paper.");
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  // soft alpha edge (3x3 blur of the mask)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += m[yy * w + xx]; c++; } }
    a[(y * w + x) * 4 + 3] = Math.round(255 * s / c);
  }
  ctx.putImageData(px, 0, 0);
  const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** shrink a cutout so it fits in localStorage */
export function thumb(canvas, max = 384) {
  const k = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}
