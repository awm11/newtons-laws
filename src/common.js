// Shared constants, maths helpers and canvas drawing used by all three modes.

export const WORLD_W = 720;          // the space panel is always 720 units wide; its height follows the panel's shape
export const PX = 16;                // 16 units of space = 1 metre
export const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
export const MAX_SPEED = 50;         // m/s - go faster than this and the sim resets
export const NB = ' ';          // non-breaking space, so a value never gets split from its unit

// One colour per law, easy to tell apart across a room full of screens
export const MODES = [
  { id: 1, num: 'I', name: 'First law', sub: 'Inertia', col: '#ffb21e', ink: '#2a1800',
    law: 'An object stays at rest, or keeps moving at a constant velocity, unless a resultant force acts on it.' },
  { id: 2, num: 'II', name: 'Second law', sub: 'F = ma', col: '#ff4fd1', ink: '#2a0020',
    law: 'The resultant force on an object equals its mass times its acceleration: F = m × a.' },
  { id: 3, num: 'III', name: 'Third law', sub: 'Action and reaction', col: '#2fe3ff', ink: '#002a33',
    law: 'When two objects interact, they exert equal and opposite forces on each other.' },
];

// Force pair colours in Mode III
export const PAIR = { contact: '#5ee6a0', gravity: '#ff8a4c', arm: '#b69bff' };

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const wrap = (v, m) => ((v % m) + m) % m;
export const wrapDelta = (d, m) => d - m * Math.round(d / m);   // shortest way round a wrapped edge
export function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// "1.5", "0.25", "2" - up to two decimal places, no trailing zeros
export const fmt = (x, dp = 2) => {
  const r = Math.round(x * 10 ** dp) / 10 ** dp;
  return (Object.is(r, -0) ? 0 : r).toLocaleString('en-GB', { maximumFractionDigits: dp });
};
export const fmtInt = x => Math.round(x).toLocaleString('en-GB');

// Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => { const c = (n >> s) & 255; return Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt)); };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Calls fn(x, y) once, plus again on the far side of any edge the object overlaps,
// so things that wrap around the edges are drawn whole on both sides
export function drawWrapped(x, y, r, W, H, fn) {
  const xs = [x], ys = [y];
  if (x < r) xs.push(x + W); else if (x > W - r) xs.push(x - W);
  if (y < r) ys.push(y + H); else if (y > H - r) ys.push(y - H);
  for (const a of xs) for (const b of ys) fn(a, b);
}

// ===== Space background =====
const STARS = (() => {
  const r = seeded(7);
  return Array.from({ length: 220 }, () => ({ fx: r(), fy: r(), s: r() < 0.08 ? 1.6 : r() < 0.35 ? 1.1 : 0.7, ph: r() * 6.3, sp: 0.6 + r() * 2.2, warm: r() < 0.18 }));
})();

export function drawSpace(ctx, W, H, t, col, grid = true) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05080f'); g.addColorStop(1, '#0b1424');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // a faint nebula, tinted with the mode's colour
  const n1 = ctx.createRadialGradient(W * 0.78, H * 0.22, 0, W * 0.78, H * 0.22, W * 0.5);
  n1.addColorStop(0, rgba(col, 0.10)); n1.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = n1; ctx.fillRect(0, 0, W, H);
  const n2 = ctx.createRadialGradient(W * 0.15, H * 0.85, 0, W * 0.15, H * 0.85, W * 0.42);
  n2.addColorStop(0, 'rgba(91,155,240,0.08)'); n2.addColorStop(1, 'rgba(91,155,240,0)');
  ctx.fillStyle = n2; ctx.fillRect(0, 0, W, H);
  // a faint map grid, so drifting is easy to judge
  if (grid) {
    ctx.strokeStyle = 'rgba(140,190,230,0.055)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 80; y < H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }
  for (const s of STARS) {
    const a = 0.45 + 0.4 * Math.sin(t * s.sp + s.ph);
    ctx.fillStyle = s.warm ? `rgba(255,214,170,${a})` : `rgba(220,235,255,${a})`;
    ctx.beginPath(); ctx.arc(s.fx * W, s.fy * H, s.s, 0, Math.PI * 2); ctx.fill();
  }
}

// ===== The spaceship: a round pod with four fixed thrusters =====
// fire = { up, down, left, right } says which way the thrust FORCE points;
// the flame comes out of the nozzle on the opposite side.
const NOZZLES = { right: [-1, 0], left: [1, 0], up: [0, 1], down: [0, -1] };

function drawFlame(ctx, dx, dy, col, t, k) {
  const flick = 0.82 + 0.18 * Math.sin(t * 61 + k * 1.7) + 0.08 * Math.sin(t * 97 + k);
  const len = 30 * flick, w = 8;
  ctx.save();
  ctx.rotate(Math.atan2(dy, dx));
  ctx.translate(21, 0);
  const g = ctx.createLinearGradient(0, 0, len, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, rgba(col, 0.95)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -w); ctx.quadraticCurveTo(len * 0.45, -w * 0.8, len, 0); ctx.quadraticCurveTo(len * 0.45, w * 0.8, 0, w); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.moveTo(0, -3.5); ctx.quadraticCurveTo(len * 0.25, 0, 0, 3.5); ctx.fill();
  ctx.restore();
}

export function drawShip(ctx, x, y, col, fire, t, opts = {}) {
  const s = opts.scale || 1, pods = opts.pods || 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  fire = fire || {};
  let i = 0;
  for (const k in NOZZLES) { if (fire[k]) drawFlame(ctx, NOZZLES[k][0], NOZZLES[k][1], col, t, i); i++; }
  // glow
  const gl = ctx.createRadialGradient(0, 0, 8, 0, 0, 34);
  gl.addColorStop(0, rgba(col, 0.32)); gl.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
  // cargo pods bolted on between the nozzles (more mass)
  const podAngles = [Math.PI / 4, (5 * Math.PI) / 4, (3 * Math.PI) / 4, (7 * Math.PI) / 4];
  for (let p = 0; p < Math.min(4, pods); p++) {
    ctx.save(); ctx.rotate(podAngles[p]);
    ctx.fillStyle = '#4a5866'; ctx.fillRect(12, -2.5, 6, 5);
    ctx.fillStyle = '#6b7c8c'; ctx.strokeStyle = '#2a333c'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect(17, -7, 13, 14, 3); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(20, -7); ctx.lineTo(20, 7); ctx.moveTo(26, -7); ctx.lineTo(26, 7); ctx.stroke();
    ctx.restore();
  }
  // nozzles
  for (const k in NOZZLES) {
    const [dx, dy] = NOZZLES[k];
    ctx.save(); ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = fire[k] ? '#cfd8e0' : '#8b98a5'; ctx.strokeStyle = '#2a333c'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(13, -4.5); ctx.lineTo(21, -6.5); ctx.lineTo(21, 6.5); ctx.lineTo(13, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // hull
  const hg = ctx.createRadialGradient(-5, -6, 2, 0, 0, 16);
  hg.addColorStop(0, shade(col, 0.55)); hg.addColorStop(0.55, col); hg.addColorStop(1, shade(col, -0.45));
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(col, -0.6); ctx.lineWidth = 1.5; ctx.stroke();
  // band and rivets
  ctx.strokeStyle = shade(col, -0.3); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); ctx.stroke();
  // cockpit dome
  const dg = ctx.createRadialGradient(-2.5, -3, 0.5, 0, 0, 7.5);
  dg.addColorStop(0, '#d9f4ff'); dg.addColorStop(0.35, '#3d6c8f'); dg.addColorStop(1, '#0d1c2a');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.ellipse(-2.6, -3.2, 2.2, 1.3, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ===== Arrows and labels =====
export function haloText(ctx, txt, x, y, col, lw = 4) {
  ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(5,8,15,0.88)'; ctx.lineWidth = lw; ctx.strokeText(txt, x, y);
  ctx.fillStyle = col; ctx.fillText(txt, x, y);
}

// An arrow from (x, y) along the unit vector (ux, uy)
export function drawArrow(ctx, x, y, ux, uy, len, col, alpha = 1, width = 4.5) {
  if (len < 1 || alpha <= 0) return;
  const head = Math.min(13, len * 0.6), ex = x + ux * len, ey = y + uy * len;
  const bx = ex - ux * head, by = ey - uy * head, px = -uy, py = ux;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(5,8,15,0.7)'; ctx.lineWidth = width + 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(5,8,15,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx + px * 8, by + py * 8); ctx.lineTo(ex, ey); ctx.lineTo(bx - px * 8, by - py * 8); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

// A label placed beside an arrow, pushed off to one side of it
// (returns the box the label covers, so other labels can keep clear of it)
export function arrowLabel(ctx, x, y, ux, uy, len, txt, col, alpha = 1, side = 1, size = 15, measureOnly = false) {
  if (alpha <= 0) return null;
  const mx = x + ux * len * 0.55, my = y + uy * len * 0.55;
  const px = -uy * side, py = ux * side;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `700 ${size}px ${FONT}`;
  const ha = px > 0.35 ? 'left' : px < -0.35 ? 'right' : 'center', va = py > 0.35 ? 'top' : py < -0.35 ? 'bottom' : 'middle';
  ctx.textAlign = ha; ctx.textBaseline = va;
  const tx = mx + px * 12, ty = my + py * 12, w = ctx.measureText(txt).width, h = size * 1.15;
  if (!measureOnly) haloText(ctx, txt, tx, ty, col, 5);
  ctx.restore();
  const bx = ha === 'left' ? tx : ha === 'right' ? tx - w : tx - w / 2, by = va === 'top' ? ty : va === 'bottom' ? ty - h : ty - h / 2;
  return { x: bx - 3, y: by - 3, w: w + 6, h: h + 6 };
}

export function massLabel(ctx, txt, x, y, col = '#e4edf1') {
  ctx.save();
  ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const w = ctx.measureText(txt).width + 12;
  ctx.fillStyle = 'rgba(5,8,15,0.72)'; ctx.strokeStyle = 'rgba(140,190,230,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w, 20, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.fillText(txt, x, y + 3);
  ctx.restore();
}
export function massLabelWidth(ctx, txt) {
  ctx.save(); ctx.font = `700 14px ${FONT}`; const w = ctx.measureText(txt).width + 12; ctx.restore();
  return w;
}

// Sparkly burst for a success moment
export function drawBurst(ctx, x, y, age, col) {
  if (age > 1.6) return;
  const r = seeded(3), a = 1 - age / 1.6;
  ctx.save();
  ctx.strokeStyle = rgba(col, 0.8 * a); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 20 + age * 160, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 28; i++) {
    const ang = r() * Math.PI * 2, sp = 80 + r() * 200, d = sp * age * (1 - age * 0.25);
    ctx.fillStyle = i % 3 ? rgba(col, a) : `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 2 + r() * 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function bannerText(ctx, txt, x, y, col, age) {
  const a = clamp(age * 4, 0, 1), sc = 0.8 + 0.2 * clamp(age * 5, 0, 1);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(sc, sc);
  ctx.font = `800 30px "Bricolage Grotesque", ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = col; ctx.shadowBlur = 22;
  haloText(ctx, txt, 0, 0, col, 7);
  ctx.restore();
}

// Shown for a couple of seconds after the sim resets for going too fast
export function drawOverspeed(ctx, W, H, age) {
  if (age > 2.6) return;
  const a = clamp(Math.min(age * 5, (2.6 - age) * 2), 0, 1);
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(5,8,15,0.55)'; ctx.fillRect(0, H * 0.21 - 30, W, 60);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `800 30px "Bricolage Grotesque", ${FONT}`; ctx.shadowColor = '#ff6b5e'; ctx.shadowBlur = 18;
  haloText(ctx, 'TOO FAST!', W / 2, H * 0.21, '#ff8a7e', 7);
  ctx.restore();
}
