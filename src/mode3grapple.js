// Mode III (b) - the grapple arm. Hook an asteroid, then pull it in or push it away.
// The arm pulls (or pushes) both objects with the same size of force, so both of them move:
// a light asteroid races to the ship, a heavy one drags the ship to it.
import { PX, MAX_SPEED, MODES, PAIR, clamp, wrap, wrapDelta, seeded, rgba, drawSpace, drawShip, drawWrapped, drawArrow, arrowLabel, massLabel, massLabelWidth, haloText, fmtInt, FONT } from './common.js';

const COL = MODES[2].col;
const SHIP_M = 2000, SHIP_R = 20;
const ARM_F = 1500;                       // N, pulling or pushing
const ARM_FIRE = 0.3, ARM_BACK = 0.35;    // seconds to shoot out and to wind back
const ARROW_LEN = 48;
const LEEWAY = 0.6;                       // seconds the arm stays on after the ship or its asteroid slips through an edge
const ROCKS = [
  { m: 250, at: [0.62, 0.24] },
  { m: 1000, at: [0.14, 0.2] },
  { m: 2000, at: [0.72, 0.7] },
  { m: 20000, at: [0.4, 0.8] },
];
const radiusOf = m => 9 * Math.cbrt(m / 250);

export class Grapple {
  constructor() { this.W = 960; this.H = 540; this.reset(); }

  reset() {
    this.place = true; this.arm = null; this.fire = {}; this.force = 0; this.flash = null; this.note = null; this.fuel = null;
  }
  doPlace() {
    const { W, H } = this;
    this.ship = { x: 0.3 * W, y: 0.48 * H, vx: 0, vy: 0, m: SHIP_M, r: SHIP_R, ship: true };
    this.rocks = ROCKS.map((d, i) => {
      const r = radiusOf(d.m), rnd = seeded(40 + i * 7);
      const pts = Array.from({ length: 12 }, (_, k) => [(k / 12) * Math.PI * 2, 0.8 + 0.2 * rnd()]);
      const craters = Array.from({ length: 3 + Math.round(r / 12) }, () => [(rnd() - 0.5) * r * 1.1, (rnd() - 0.5) * r * 1.1, r * (0.1 + rnd() * 0.14)]);
      return { x: d.at[0] * W, y: d.at[1] * H, vx: 0, vy: 0, m: d.m, r, pts, craters, rot: rnd() * 6 };
    });
    this.place = false;
  }
  bodies() { return [this.ship, ...this.rocks]; }
  delta(a, b) { return { x: wrapDelta(b.x - a.x, this.W), y: wrapDelta(b.y - a.y, this.H) }; }
  // the arm never goes through the edges: it always reaches straight across the screen
  // While something is slipping through an edge, the arm stays attached to where it would be if the edge
  // weren't there (its copy just over the edge): so = ship offset, to = asteroid offset.
  armVec() {
    const a = this.arm;
    return a.state === 'back' ? a.vec : { x: a.target.x + a.to.x - this.ship.x - a.so.x, y: a.target.y + a.to.y - this.ship.y - a.so.y };
  }

  // a click or tap on an asteroid fires the arm at it; anywhere else lets go
  click(wx, wy) {
    if (this.place) return;
    const hit = this.rocks.find(r => Math.hypot(wrapDelta(wx - r.x, this.W), wrapDelta(wy - r.y, this.H)) < r.r + 10);
    if (!hit) { this.letGo(); return; }
    if (this.arm && this.arm.target === hit && this.arm.state !== 'back') return;
    this.arm = { target: hit, state: 'out', p: 0, so: { x: 0, y: 0 }, to: { x: 0, y: 0 }, grace: 0 };
  }
  letGo(vec) {
    const a = this.arm;
    if (!a || a.state === 'back') return;
    // wind back in along a fixed line from the ship
    const v = vec || this.armVec();
    a.vec = v; if (a.state !== 'out') a.p = 1;
    a.state = 'back';
  }

  update(dt, inp) {
    if (this.place) this.doPlace();
    if (inp.release) this.letGo();
    if (this.flash) { this.flash.age += dt; if (this.flash.age > 0.8) this.flash = null; }
    const s = this.ship, d = inp.dirs;
    // no fuel in this scene: the thrusters are dead, and pressing them says so
    this.fire = {};
    if (d.left || d.right || d.up || d.down) this.fuel = { age: 0 };
    else if (this.fuel) { this.fuel.age += dt; if (this.fuel.age > 2.2) this.fuel = null; }
    let ax = 0, ay = 0, rax = 0, ray = 0;

    // the arm
    const arm = this.arm;
    this.force = 0;
    if (arm) {
      // the sway's period depends on the arm's length, like a pendulum: longer arm, slower sway
      const period = clamp(0.15 * Math.sqrt(arm.len || 100), 0.5, 3);
      arm.ph = ((arm.ph || 0) + (dt * 2 * Math.PI) / period) % (2 * Math.PI);
      if (arm.state === 'out') { arm.p += dt / ARM_FIRE; if (arm.p >= 1) { arm.p = 1; arm.state = 'hooked'; } }
      else if (arm.state === 'back') { arm.p -= dt / ARM_BACK; if (arm.p <= 0) this.arm = null; }
    }
    if (this.arm && this.arm.state === 'hooked') {
      const r = this.arm.target, dl = this.armVec(), dist = Math.hypot(dl.x, dl.y), nx = dl.x / dist, ny = dl.y / dist;
      if (dist > Math.hypot(this.W, this.H) + 60) this.letGo();   // the arm reaches anywhere on screen
      else {
        const touching = dist <= s.r + r.r + 1.5;
        if (inp.pull && !inp.push && !touching) this.force = 1;
        else if (inp.push && !inp.pull) this.force = -1;
        if (this.force) {
          // equal and opposite: the ship is pulled towards the asteroid, the asteroid towards the ship
          ax += (this.force * ARM_F * nx) / s.m; ay += (this.force * ARM_F * ny) / s.m;
          rax = (-this.force * ARM_F * nx) / r.m; ray = (-this.force * ARM_F * ny) / r.m;
        }
        this.n = { x: nx, y: ny };
      }
    }
    s.vx += ax * dt; s.vy += ay * dt;
    if (this.force && this.arm) { const r = this.arm.target; r.vx += rax * dt; r.vy += ray * dt; }
    // move everything, noting anything that goes off one edge and comes back on the opposite one
    const held = this.arm && this.arm.state !== 'back' ? this.arm : null;
    const move = (b, nx, ny) => {
      const wx = wrap(nx, this.W), wy = wrap(ny, this.H);
      // keep the arm attached to where the object would have been without the edge
      if (held && (b === s || b === held.target)) { const o = b === s ? held.so : held.to; o.x += nx - wx; o.y += ny - wy; }
      b.x = wx; b.y = wy;
    };
    for (const b of this.bodies()) move(b, b.x + b.vx * PX * dt, b.y + b.vy * PX * dt);
    this.collide(move);
    if (held && this.arm === held) {
      const so = held.so, to = held.to;
      if (Math.abs(so.x - to.x) < 1 && Math.abs(so.y - to.y) < 1) { so.x = so.y = to.x = to.y = 0; }   // both went through together
      const over = so.x || so.y || to.x || to.y;
      // a little leeway: if it doesn't come back through the edge quickly, the arm lets go
      held.grace = over ? held.grace + dt : 0;
      if (held.grace > LEEWAY) { this.letGo(); this.note = { txt: 'Let go at the edge', age: 0 }; }
    }
    if (this.note) { this.note.age += dt; if (this.note.age > 1.4) this.note = null; }
  }

  // simple bumps between round objects; the hooked asteroid and the ship stick together when pulled in
  collide(move) {
    const bs = this.bodies(), hookT = this.arm && this.arm.state === 'hooked' ? this.arm.target : null;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j], d = this.delta(a, b), dist = Math.hypot(d.x, d.y), min = a.r + b.r;
      if (dist >= min || dist === 0) continue;
      const nx = d.x / dist, ny = d.y / dist, ia = 1 / a.m, ib = 1 / b.m;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const e = (a.ship && b === hookT) ? 0 : 0.35;
        const J = (-(1 + e) * vn) / (ia + ib);
        a.vx -= J * nx * ia; a.vy -= J * ny * ia; b.vx += J * nx * ib; b.vy += J * ny * ib;
      }
      const over = min - dist, k = over / (ia + ib);
      move(a, a.x - nx * k * ia, a.y - ny * k * ia);
      move(b, b.x + nx * k * ib, b.y + ny * k * ib);
    }
  }

  overSpeed() { return !this.place && this.bodies().some(b => Math.hypot(b.vx, b.vy) > MAX_SPEED); }

  draw(ctx, t) {
    if (this.place) this.doPlace();
    const { W, H } = this, s = this.ship;
    drawSpace(ctx, W, H, t, COL);
    for (const r of this.rocks) drawWrapped(r.x, r.y, r.r + 40, W, H, (x, y) => drawRock(ctx, x, y, r));
    if (this.flash) {
      const r = this.flash.target, a = 1 - this.flash.age / 0.8;
      ctx.save(); ctx.strokeStyle = `rgba(255,107,94,${a})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r + 10 + this.flash.age * 20, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'center'; ctx.globalAlpha = a;
      haloText(ctx, 'Out of reach', r.x, r.y - r.r - 16, '#ff8a7e', 4); ctx.restore();
    }
    if (this.arm) this.drawArm(ctx, t);
    if (this.note) {
      ctx.save(); ctx.globalAlpha = clamp(1.4 - this.note.age, 0, 1);
      ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'center';
      haloText(ctx, this.note.txt, s.x, s.y - 34, '#e4edf1', 4); ctx.restore();
    }
    drawWrapped(s.x, s.y, 60, W, H, (x, y) => drawShip(ctx, x, y, COL, this.fire, t));
    if (this.fuel) {
      ctx.save(); ctx.globalAlpha = clamp(2.2 - this.fuel.age, 0, 1) * (0.75 + 0.25 * Math.sin(t * 18));
      ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center';
      haloText(ctx, 'OUT OF FUEL', W / 2, H * 0.1, '#ff8a7e', 5);
      ctx.font = `700 15px ${FONT}`;
      haloText(ctx, 'Use the grapple arm on the asteroids', W / 2, H * 0.1 + 26, '#e4edf1', 4); ctx.restore();
    }
    // the force pair along the arm; its arrows and labels are things the mass labels keep clear of
    const keepClear = [];
    if (this.note) keepClear.push({ x: s.x - 80, y: s.y - 50, w: 160, h: 22 });
    if (this.force && this.arm) {
      const a = this.arm, n = this.n, f = this.force, pull = f > 0;
      const s = { x: this.ship.x + a.so.x, y: this.ship.y + a.so.y }, r = { x: a.target.x + a.to.x, y: a.target.y + a.to.y };
      drawArrow(ctx, s.x, s.y, n.x * f, n.y * f, ARROW_LEN, PAIR.arm);
      drawArrow(ctx, r.x, r.y, -n.x * f, -n.y * f, ARROW_LEN, PAIR.arm);
      keepClear.push(arrowLabel(ctx, s.x, s.y, n.x * f, n.y * f, ARROW_LEN, pull ? 'Asteroid pulls ship' : 'Asteroid pushes ship', PAIR.arm, 1, 1));
      keepClear.push(arrowLabel(ctx, r.x, r.y, -n.x * f, -n.y * f, ARROW_LEN, pull ? 'Ship pulls asteroid' : 'Ship pushes asteroid', PAIR.arm, 1, 1));
      for (const [ox, oy, ux, uy] of [[s.x, s.y, n.x * f, n.y * f], [r.x, r.y, -n.x * f, -n.y * f]]) {
        const ex = ox + ux * ARROW_LEN, ey = oy + uy * ARROW_LEN;
        keepClear.push({ x: Math.min(ox, ex) - 8, y: Math.min(oy, ey) - 8, w: Math.abs(ex - ox) + 16, h: Math.abs(ey - oy) + 16 });
      }
    }
    // the arm itself, as a chain of small boxes along it
    if (this.arm) {
      const a = this.arm, d = this.armVec(), L = Math.hypot(d.x, d.y) * (a.state === 'hooked' ? 1 : clamp(a.p, 0, 1));
      const sx = this.ship.x + a.so.x, sy = this.ship.y + a.so.y, ux = d.x / (Math.hypot(d.x, d.y) || 1), uy = d.y / (Math.hypot(d.x, d.y) || 1);
      for (let k = 20; k < L - 10; k += 12) keepClear.push({ x: sx + ux * k - 5, y: sy + uy * k - 5, w: 10, h: 10 });
    }
    this.drawMassLabels(ctx, keepClear);
  }

  // Each mass label sits below its object if it can; if that spot is covered by a force label or arrow
  // (or another mass label), it moves above, to the side, or diagonally - whichever is clear
  drawMassLabels(ctx, keepClear) {
    const { W, H } = this, s = this.ship;
    const items = [{ b: s, r: 24, txt: fmtInt(s.m) + '\u00A0kg' }, ...this.rocks.map(r => ({ b: r, r: r.r + 2, txt: fmtInt(r.m) + '\u00A0kg' }))];
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const placed = [...keepClear];
    for (const it of items) {
      const w = massLabelWidth(ctx, it.txt), { x, y } = it.b, r = it.r;
      const spots = [[x, y + r + 4], [x, y - r - 24], [x + r + 6 + w / 2, y - 10], [x - r - 6 - w / 2, y - 10],
        [x + r * 0.7 + w / 2, y + r * 0.7], [x - r * 0.7 - w / 2, y + r * 0.7], [x + r * 0.7 + w / 2, y - r * 0.7 - 20], [x - r * 0.7 - w / 2, y - r * 0.7 - 20]];
      const box = i => ({ x: spots[i][0] - w / 2, y: spots[i][1], w, h: 20 });
      const cost = i => placed.reduce((sum, o) => sum + overlap(box(i), o), 0);
      // stay where it was if that is still clear, so labels don't hop about
      let pick = it.b.lbl !== undefined && !placed.some(o => hit(box(it.b.lbl), o)) ? it.b.lbl : -1;
      if (pick < 0) pick = spots.findIndex((_, i) => !placed.some(o => hit(box(i), o)));
      if (pick < 0) { pick = 0; for (let i = 1; i < spots.length; i++) if (cost(i) < cost(pick)) pick = i; }
      it.b.lbl = pick;
      placed.push(box(pick));
      const dx = spots[pick][0] - x, dy = spots[pick][1] - y;
      drawWrapped(x, y, r + 60, W, H, (cx, cy) => massLabel(ctx, it.txt, cx + dx, cy + dy));
    }
  }

  drawArm(ctx, t) {
    const arm = this.arm, r = arm.target, d = this.armVec(), dist = Math.max(1, Math.hypot(d.x, d.y));
    const s = { x: this.ship.x + arm.so.x, y: this.ship.y + arm.so.y };
    const nx = d.x / dist, ny = d.y / dist, px = -ny, py = nx;
    const S = { x: s.x + nx * 14, y: s.y + ny * 14 };
    const reach = Math.max(0, dist - 14 - r.r * 0.85);
    const len = reach * clamp(arm.p, 0, 1);
    const E = { x: S.x + nx * len, y: S.y + ny * len };
    const taut = arm.state === 'hooked' && this.force !== 0;
    arm.len = len;
    const wob = taut ? 0 : Math.sin(arm.ph || 0) * Math.min(15, len * 0.08) * (arm.state === 'hooked' ? 1 : 0.4);   // a gentle sway when slack
    const C = { x: (S.x + E.x) / 2 + px * wob, y: (S.y + E.y) / 2 + py * wob };
    {
      ctx.save();
      const path = () => { ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.quadraticCurveTo(C.x, C.y, E.x, E.y); };
      ctx.lineCap = 'round';
      path(); ctx.strokeStyle = '#1b232c'; ctx.lineWidth = 8; ctx.stroke();
      path(); ctx.strokeStyle = taut ? '#d7e3ee' : '#9fb0c0'; ctx.lineWidth = 4.5; ctx.stroke();
      // joints along the arm
      const nj = Math.floor(len / 24);
      for (let k = 1; k <= nj; k++) {
        const u = k / (nj + 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        const jx = a * S.x + b * C.x + c * E.x, jy = a * S.y + b * C.y + c * E.y;
        ctx.fillStyle = COL; ctx.strokeStyle = '#1b232c'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(jx, jy, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      // the claw
      const ang = Math.atan2(E.y - C.y, E.x - C.x), open = arm.state === 'out' ? 0.75 : arm.state === 'back' ? 0.6 : 0.25;
      ctx.translate(E.x, E.y); ctx.rotate(ang);
      ctx.strokeStyle = '#d7e3ee'; ctx.lineWidth = 3;
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-2, 0); ctx.quadraticCurveTo(5, sgn * (6 + open * 6), 11, sgn * (2 + open * 6)); ctx.stroke(); }
      ctx.fillStyle = COL; ctx.beginPath(); ctx.arc(-2, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  snap() {
    const a = this.arm;
    return { arm: a ? a.state : null, force: this.force };
  }
}

function drawRock(ctx, x, y, r) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(r.rot);
  const g = ctx.createRadialGradient(-r.r * 0.35, -r.r * 0.35, r.r * 0.1, 0, 0, r.r * 1.1);
  g.addColorStop(0, '#b3a797'); g.addColorStop(0.6, '#7c7164'); g.addColorStop(1, '#4a4239');
  ctx.fillStyle = g; ctx.strokeStyle = '#2d2822'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  r.pts.forEach(([a, f], i) => { const px = Math.cos(a) * r.r * f * 1.08, py = Math.sin(a) * r.r * f * 1.08; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(45,40,34,0.35)';
  for (const [cx, cy, cr] of r.craters) { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
void rgba;
