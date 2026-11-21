// Free persona generator (port of the Python one): name, kind, greeting, pitch and gait from the drawing's main colour.
const ADJ = { green: ['Mossy', 'Leafy', 'Pickle'], blue: ['Splashy', 'Bluebell', 'Puddle'], red: ['Zippy', 'Cherry', 'Rocket'],
  yellow: ['Sunny', 'Buttery', 'Zappy'], purple: ['Grape', 'Wizzy', 'Plum'], orange: ['Pumpkin', 'Tangy', 'Toasty'],
  pink: ['Bubblegum', 'Rosy', 'Fluffy'], brown: ['Muddy', 'Cocoa', 'Twiggy'], gray: ['Pebble', 'Misty', 'Stormy'] };
const SYL = ['zib', 'bo', 'lu', 'mo', 'fi', 'zor', 'pip', 'wum', 'ka', 'dee', 'nug', 'ble', 'tik', 'oo'];
const KIND = ['monster', 'critter', 'beastie', 'dragonling', 'blob', 'gremlin'];
const GREETINGS = ["Hi! I'm {name}! Wanna play?", "Rawr! I'm {name}, the {adj} {kind}!", 'Hello, hello! {name} is here!', "I'm {name}! Boop me again!"];

function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function dominantColor(canvas) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(canvas, 0, 0, 64, 64);
  const d = x.getImageData(0, 0, 64, 64).data, hues = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= 128) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx === 0 || (mx - mn) / mx <= 70 / 255) continue;
    let h; const dd = mx - mn;
    if (mx === r) h = ((g - b) / dd + 6) % 6; else if (mx === g) h = (b - r) / dd + 2; else h = (r - g) / dd + 4;
    hues.push(h * 60);
  }
  if (hues.length < 20) return 'gray';
  hues.sort((p, q) => p - q); const h = hues[hues.length >> 1];
  for (const [lim, name] of [[15, 'red'], [40, 'orange'], [70, 'yellow'], [170, 'green'], [250, 'blue'], [290, 'purple'], [340, 'pink'], [361, 'red']]) if (h < lim) return name;
  return 'gray';
}

export function persona(canvas, seed) {
  const r = rng(hash(seed)), pick = (a) => a[Math.floor(r() * a.length)];
  const color = dominantColor(canvas);
  const name = Array.from({ length: pick([2, 2, 3]) }, () => pick(SYL)).join('');
  const Name = name[0].toUpperCase() + name.slice(1);
  const adj = pick(ADJ[color]), kind = pick(KIND);
  const round2 = (v) => Math.round(v * 100) / 100;
  return { name: Name, color, adjective: adj, kind,
    greeting: pick(GREETINGS).replace('{name}', Name).replace('{adj}', adj.toLowerCase()).replace('{kind}', kind),
    pitch: round2(0.85 + r() * 0.75), speed: round2(0.7 + r() * 0.7), bounce: round2(0.6 + r() * 0.8) };
}
