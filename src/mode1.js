// Mode I - Newton's first law. The ship keeps its velocity unless a thruster fires.
// Challenge: dock with a mothership that drifts at a constant velocity. "Stopped" means stopped relative to it.
import { PX, MAX_SPEED, MODES, clamp, wrap, wrapDelta, seeded, rgba, drawSpace, drawShip, drawWrapped, drawBurst, bannerText, haloText, FONT } from './common.js';

const COL = MODES[0].col;
export const M1 = { mass: 1000, thrust: 1000 };   // 1 m/s² while a thruster fires
const DOT_EVERY = 0.6;                  // seconds between ghost dots
const DOT_COL = '#6dffa8';
const MS_DOT_COL = '#bfe3ff';           // the mothership's own ghost dots
const SETTLE = 0.6;                     // seconds the ship must stay matched inside the bay
const STOPPED = 0.05;                   // m/s - relative speed below this counts as stopped
const SHIP_R = 20;                      // the ship's size, nozzles included: any touch on the hull is a crash
const ALONG = { x: 330, y: 230 };       // round 3: this close to the mothership, the ship goes through the diagonal portal with it
const OFF_MAX = 7;                      // ...and may stay off screen with it for up to this many seconds
const EDGE_NEAR = 200;                  // (only when the mothership is this close to an edge, i.e. crossing)

// The mothership, in its own frame (units). The docking bay is a notch open at the top.
const HULL = [[-130, -46, -40, 55], [40, -46, 130, 55], [-40, 10, 40, 55]];   // solid blocks: x1, y1, x2, y2
const BAY = { x1: -40, y1: -46, x2: 40, y2: 10 };
const IN_BAY = { x: BAY.x2 - SHIP_R, y1: BAY.y1 + SHIP_R, y2: BAY.y2 - SHIP_R };   // where the ship's centre must be

// Positions are fractions of the panel; velocities in m/s. The mothership never drifts slower than 1 m/s; round 3 is over 3 m/s.
export const DOCK_ROUNDS = [
  { ms: [0.28, 0.7], mv: [1, 0], ship: [0.3, 0.22], v: [0, 0], hint: 'The mothership drifts at a steady 1 m/s. Match its velocity and settle into the docking bay.' },
  { ms: [0.74, 0.7], mv: [-1.6, 0], ship: [0.72, 0.2], v: [0, 0], hint: "Match the mothership's velocity and settle into the docking bay.", bare: true },
  { ms: [0.16, 0.34], mv: [2.7, 1.4], ship: [0.85, 0.81], v: [-1.5, -0.8], hint: "Match the mothership's velocity and settle into the docking bay.", bare: true, lineWrap: true },
];

export class Inertia {
  constructor() { this.W = 960; this.H = 540; this.challenge = null; this.reset(); }

  reset() {
    this.place = true; this.dots = []; this.msDots = []; this.dotT = 0; this.fire = {}; this.seed = seeded(21); this.portal = false; this.offFor = 0;
    if (this.challenge) Object.assign(this.challenge, { still: 0, won: false, wonAge: 0, crash: null, inside: false });
  }
  setChallenge(on, round = 0) {
    this.challenge = on ? { round } : null;
    this.reset();
  }
  // put the ship (and the mothership) in place, once the panel's height is known
  doPlace() {
    const { W, H } = this, c = this.challenge;
    if (c) {
      const r = DOCK_ROUNDS[c.round];
      this.x = r.ship[0] * W; this.y = r.ship[1] * H; this.vx = r.v[0]; this.vy = r.v[1];
      c.ms = { x: r.ms[0] * W, y: r.ms[1] * H, vx: r.mv[0], vy: r.mv[1], lineWrap: !!r.lineWrap, ax: r.ms[0] * W, ay: r.ms[1] * H };
    } else { this.x = W / 2; this.y = H / 2; this.vx = 0; this.vy = 0; }
    this.place = false;
  }

  update(dt, inp) {
    if (this.place) this.doPlace();
    const { W, H } = this, d = inp.dirs, c = this.challenge, ms = c && c.ms;
    if (ms) {
      if (ms.lineWrap) {
        // this mothership wraps along its own diagonal: whatever goes out at one end of its track
        // comes straight back in at the other end (see track())
        ms.x += ms.vx * PX * dt; ms.y += ms.vy * PX * dt;
        const tr = this.track(), along = (ms.x - tr.ex) * tr.ux + (ms.y - tr.ey) * tr.uy;
        const k = along >= tr.C ? -1 : along < 0 ? 1 : 0;
        if (k) { ms.x += k * tr.C * tr.ux; ms.y += k * tr.C * tr.uy; }
      } else { ms.x = wrap(ms.x + ms.vx * PX * dt, W); ms.y = wrap(ms.y + ms.vy * PX * dt, H); }
    }

    if (c && c.crash !== null) {
      // after a crash, the round starts again
      c.crash += dt; this.fire = {};
      if (c.crash > 1.6) this.reset();
      this.dropDots(dt);
      return;
    }
    if (c && c.won) {
      // docked: the clamps hold the ship, so it moves with the mothership
      c.wonAge += dt; this.fire = {};
      this.x = ms.x + c.off.x; this.y = ms.y + c.off.y; if (!ms.lineWrap) { this.x = wrap(this.x, W); this.y = wrap(this.y, H); } else this.portal = true;
      this.vx = ms.vx; this.vy = ms.vy;
      this.dropDots(dt);
      return;
    }

    this.fire = { ...d };
    const a = M1.thrust / M1.mass;
    const ax = ((d.right ? 1 : 0) - (d.left ? 1 : 0)) * a, ay = ((d.down ? 1 : 0) - (d.up ? 1 : 0)) * a;
    this.vx += ax * dt; this.vy += ay * dt;
    const nx = this.x + this.vx * PX * dt, ny = this.y + this.vy * PX * dt;
    // touching an edge alongside the diagonal mothership while it is crossing: go through its diagonal
    // 'portal' with it (from the moment the ship touches the edge, so it never shows a straight-across copy)
    const touching = nx - SHIP_R < 0 || nx + SHIP_R > W || ny - SHIP_R < 0 || ny + SHIP_R > H;
    if (ms && ms.lineWrap && (this.portal || (touching && this.joinsPortal(nx, ny)))) { this.x = nx; this.y = ny; this.portal = true; this.checkPortal(dt); }
    else { this.x = wrap(nx, W); this.y = wrap(ny, H); }

    if (c) {
      this.collide(c);
      if (c.crash !== null) { this.dropDots(dt); return; }
      const { lx, ly } = this.rel(ms);
      c.inside = Math.abs(lx) <= IN_BAY.x && ly >= IN_BAY.y1 && ly <= IN_BAY.y2;
      const rel = Math.hypot(this.vx - ms.vx, this.vy - ms.vy);
      c.still = c.inside && rel < STOPPED ? c.still + dt : 0;
      if (c.still >= SETTLE) { c.won = true; c.wonAge = 0; c.off = { x: lx, y: ly }; }
    }
    this.dropDots(dt);
  }

  // The diagonal mothership's track: the stretch of its line that crosses the screen, from where it
  // comes in (ex, ey) to where it goes out, C units further on. Worked out afresh for the panel's shape.
  track() {
    const ms = this.challenge.ms, sp = Math.hypot(ms.vx, ms.vy), ux = ms.vx / sp, uy = ms.vy / sp;
    const span = (a, u, max) => (u === 0 ? [-Infinity, Infinity] : [(0 - a) / u, (max - a) / u].sort((p, q) => p - q));
    const [x0, x1] = span(ms.ax, ux, this.W), [y0, y1] = span(ms.ay, uy, this.H);
    const t0 = Math.max(x0, y0), t1 = Math.min(x1, y1);
    return { ux, uy, ex: ms.ax + ux * t0, ey: ms.ay + uy * t0, C: t1 - t0 };
  }
  // the offsets at which wrapped copies of anything travelling with the diagonal mothership appear
  portalOffsets() { const tr = this.track(); return [[tr.C * tr.ux, tr.C * tr.uy], [-tr.C * tr.ux, -tr.C * tr.uy]]; }
  // how far a point is outside the screen (0 if it is on it)
  outBy(x, y) { return Math.max(0, -x, x - this.W, -y, y - this.H); }
  // of a point and its portal copies, the one that is most on screen
  onScreen(x, y) {
    let best = [x, y], d = this.outBy(x, y);
    for (const [ox, oy] of this.portalOffsets()) { const e = this.outBy(x + ox, y + oy); if (e < d) { d = e; best = [x + ox, y + oy]; } }
    return { x: best[0], y: best[1], out: d };
  }
  // Does a ship going over the edge here join the mothership in its portal? Only if it is close alongside
  // (within ALONG of a copy of it) and that copy is itself at the edge of the screen, crossing over.
  joinsPortal(x, y) {
    const ms = this.challenge.ms, W = this.W, H = this.H;
    return [[0, 0], ...this.portalOffsets()].some(([ox, oy]) => {
      const mx = ms.x + ox, my = ms.y + oy;
      const toEdge = mx < 0 || mx > W || my < 0 || my > H ? 0 : Math.min(mx, W - mx, my, H - my);
      return Math.abs(x - mx) < ALONG.x && Math.abs(y - my) < ALONG.y && toEdge < EDGE_NEAR;
    });
  }
  // While in the portal the ship moves freely and is kept at whichever of its copies is most on screen.
  // It may be out of sight for a while (corners). It leaves the portal once it is fully back on screen, or if it
  // is out of sight too long; if it is off screen then, it comes back in at an edge rather than mid-screen.
  checkPortal(dt) {
    const R = SHIP_R, W = this.W, H = this.H;
    const q = this.onScreen(this.x, this.y);
    this.x = q.x; this.y = q.y;
    this.offFor = q.out > R ? this.offFor + dt : 0;
    const fullyOn = this.x - R >= 0 && this.x + R <= W && this.y - R >= 0 && this.y + R <= H;
    if (fullyOn) { this.portal = false; this.offFor = 0; return; }
    if (this.offFor < OFF_MAX) return;
    this.portal = false; this.offFor = 0;
    const edge = (v, vel, max) => (v >= -R && v <= max + R ? v : vel < 0 ? max + R : vel > 0 ? -R : v < 0 ? max + R : -R);
    this.x = edge(this.x, this.vx, W); this.y = edge(this.y, this.vy, H);
  }

  // the ship's position in the mothership's frame, from whichever copy of the mothership is nearest
  rel(ms) {
    if (!ms.lineWrap) return { lx: wrapDelta(this.x - ms.x, this.W), ly: wrapDelta(this.y - ms.y, this.H) };
    return this.relTo(this.x, this.y);
  }
  relTo(x, y) {
    const ms = this.challenge.ms;
    let lx = x - ms.x, ly = y - ms.y;
    for (const [ox, oy] of this.portalOffsets()) { const ax = x - ms.x - ox, ay = y - ms.y - oy; if (Math.hypot(ax, ay) < Math.hypot(lx, ly)) { lx = ax; ly = ay; } }
    return { lx, ly };
  }

  // the hull is solid: touching it at all is a crash
  collide(c) {
    const ms = c.ms, { lx, ly } = this.rel(ms);
    const front = ms.vx >= 0 ? 1 : -1;
    // the bridge tower and the rear fin are solid too
    const extra = [[front * 68, -64, front * 114, -46], [-front * 96, 55, -front * 126, 68]].map(([a, b, c2, d]) => [Math.min(a, c2), b, Math.max(a, c2), d]);
    for (const [x1, y1, x2, y2] of [...HULL, ...extra]) {
      if (Math.hypot(lx - clamp(lx, x1, x2), ly - clamp(ly, y1, y2)) < SHIP_R) { c.crash = 0; c.crashAt = ms.lineWrap ? this.onScreen(this.x, this.y) : { x: this.x, y: this.y }; return; }
    }
  }

  // ghost dots: dropped at equal time intervals; they fade before the ship can come back round to them
  dropDots(dt) {
    this.dotT += dt;
    if (this.dotT >= DOT_EVERY) {
      this.dotT -= DOT_EVERY;
      const c = this.challenge;
      if (!(c && c.crash !== null)) {
        const q = c && c.ms && c.ms.lineWrap ? this.onScreen(this.x, this.y) : { x: this.x, y: this.y, out: 0 };
        if (q.out === 0) this.dots.push({ x: q.x, y: q.y, age: 0, k: this.seed() * 100 });
      }
      // the mothership's dots trail from its stern, where they can be seen
      if (c && c.ms) {
        const sx = c.ms.x + (c.ms.vx >= 0 ? -1 : 1) * 156, sy = c.ms.y + 5;
        if (c.ms.lineWrap) { const q = this.onScreen(sx, sy); if (q.out === 0) this.msDots.push({ x: q.x, y: q.y, age: 0, k: this.seed() * 100 }); }
        else this.msDots.push({ x: wrap(sx, this.W), y: sy, age: 0, k: this.seed() * 100 });
      }
    }
    const life = this.dotLife(), msLife = this.dotLife(true);
    for (const p of this.dots) p.age += dt;
    for (const p of this.msDots) p.age += dt;
    this.dots = this.dots.filter(p => p.age < life);
    this.msDots = this.msDots.filter(p => p.age < msLife);
  }
  overSpeed() { return Math.hypot(this.vx || 0, this.vy || 0) > MAX_SPEED; }
  dotLife(ofMs) {
    const c = this.challenge, v = ofMs ? (c && c.ms ? Math.hypot(c.ms.vx, c.ms.vy) : 0) : Math.hypot(this.vx, this.vy);
    return clamp((0.9 * Math.min(this.W, this.H)) / Math.max(v * PX, 1e-6), 1.5, 10);
  }

  draw(ctx, t) {
    if (this.place) this.doPlace();
    const { W, H } = this, c = this.challenge;
    drawSpace(ctx, W, H, t, COL);
    if (c) this.drawDots(ctx, t, this.msDots, this.dotLife(true), MS_DOT_COL, 0.55);
    if (c && c.ms.lineWrap) this.viaPortal(ctx, (ox, oy) => this.drawMothership(ctx, c.ms.x + ox, c.ms.y + oy, t));
    else if (c) drawWrapped(c.ms.x, c.ms.y, 150, W, H, (x, y) => this.drawMothership(ctx, x, y, t));
    this.drawDots(ctx, t, this.dots, this.dotLife(), DOT_COL, 1);
    const clamps = (ox, oy) => {
      ctx.save(); ctx.strokeStyle = '#5ee6a0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(c.ms.x + ox + s * BAY.x2, this.y + oy); ctx.lineTo(this.x + ox + s * 20, this.y + oy); ctx.stroke(); }
      ctx.restore();
    };
    if (c && c.ms.lineWrap && c.crash === null && (c.won || this.portal)) {
      // going through the diagonal portal with the mothership
      this.viaPortal(ctx, (ox, oy) => { drawShip(ctx, this.x + ox, this.y + oy, COL, this.fire, t); if (c.won) clamps(ox, oy); });
    } else if (!(c && c.crash !== null)) {
      drawWrapped(this.x, this.y, 52, W, H, (x, y) => drawShip(ctx, x, y, COL, this.fire, t));
      if (c && c.won) clamps(0, 0);
    }
    if (c && c.won) {
      const q = c.ms.lineWrap ? this.onScreen(this.x, this.y) : { x: this.x, y: this.y };
      drawBurst(ctx, q.x, q.y, c.wonAge, '#5ee6a0');
      bannerText(ctx, 'DOCKED!', W / 2, H * 0.16, '#5ee6a0', c.wonAge);
    }
    if (c && c.crash !== null) {
      drawBurst(ctx, c.crashAt.x, c.crashAt.y, c.crash, '#ff6b5e');
      bannerText(ctx, 'CRASH!', W / 2, H * 0.16, '#ff8a7e', c.crash);
    }
  }

  // Draw something that travels with the diagonal mothership, plus its copies at either end of the track.
  // Each copy only shows the part of it that has gone off the screen at the other end, so nothing appears twice.
  viaPortal(ctx, fn) {
    fn(0, 0);
    for (const [ox, oy] of this.portalOffsets()) {
      ctx.save(); ctx.beginPath();
      ctx.rect(-5000, -5000, 10000 + this.W, 10000 + this.H); ctx.rect(ox, oy, this.W, this.H);
      ctx.clip('evenodd'); fn(ox, oy); ctx.restore();
    }
  }

  drawDots(ctx, t, dots, life, col, scale) {
    for (const p of dots) {
      const fresh = p.age < 0.14, fade = 1 - p.age / life;
      const flick = 0.72 + 0.28 * Math.sin(t * 23 + p.k) * Math.sin(t * 7.3 + p.k * 2);
      if (fresh) {
        ctx.fillStyle = rgba(col, 0.28 * scale); ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = scale < 1 ? rgba(col, scale) : '#eafff2'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); ctx.fill();
      } else {
        const a = 0.8 * fade * flick * scale;
        ctx.fillStyle = rgba(col, a * 0.35); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  drawMothership(ctx, x, y, t) {
    const c = this.challenge, front = c.ms.vx >= 0 ? 1 : -1, back = -front;
    const NAVY = '#2a3f5a', NAVY2 = '#1c2c40', TRIM = '#e9eef3', ACC = '#3fd0c9', EDGE = '#0f1824';
    ctx.save(); ctx.translate(x, y);
    // engines at the back: switched off, since it is only coasting
    for (const ey of [-22, 30]) {
      ctx.fillStyle = '#3a4a5c'; ctx.strokeStyle = EDGE; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(back * 130, ey - 12); ctx.lineTo(back * 148, ey - 17); ctx.lineTo(back * 148, ey + 17); ctx.lineTo(back * 130, ey + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#141c26'; ctx.fillRect(Math.min(back * 146, back * 148), ey - 13, 2, 26);   // nozzle: dark and cold
    }
    // the rear fin under the hull
    ctx.fillStyle = NAVY2; ctx.strokeStyle = EDGE; ctx.lineWidth = 1.5;
    ctx.beginPath(); [[96, 55], [126, 55], [127, 68], [110, 68]].forEach(([px, py], i) => (i ? ctx.lineTo(back * px, py) : ctx.moveTo(back * px, py)));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // the bridge tower near the front, with a lit window strip, an antenna and a strobe
    const [b1, b2] = [front * 68, front * 114].sort((a, b) => a - b);
    ctx.fillStyle = '#3a5476'; ctx.beginPath(); ctx.roundRect(b1, -64, b2 - b1, 20, [6, 6, 0, 0]); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(150,230,255,0.85)'; ctx.fillRect(b1 + 7, -59, b2 - b1 - 14, 4);
    const ax = front > 0 ? b1 + 12 : b2 - 12;
    ctx.strokeStyle = '#9fb0c0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(ax, -64); ctx.lineTo(ax, -80); ctx.moveTo(ax - 5, -74); ctx.lineTo(ax + 5, -74); ctx.stroke();
    if ((t * 1.3) % 1 < 0.12) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(ax, -81, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; }
    else ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.arc(ax, -81, 1.8, 0, Math.PI * 2); ctx.fill();
    // the hull, with the docking bay cut into the top and a rounded nose
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(-118, -46); ctx.lineTo(BAY.x1, -46); ctx.lineTo(BAY.x1, BAY.y2); ctx.lineTo(BAY.x2, BAY.y2); ctx.lineTo(BAY.x2, -46);
      ctx.lineTo(118, -46); ctx.quadraticCurveTo(130, -46, 130, -34); ctx.lineTo(130, 43); ctx.quadraticCurveTo(130, 55, 118, 55);
      ctx.lineTo(-118, 55); ctx.quadraticCurveTo(-130, 55, -130, 43); ctx.lineTo(-130, -34); ctx.quadraticCurveTo(-130, -46, -118, -46); ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, -46, 0, 55);
    g.addColorStop(0, '#46617f'); g.addColorStop(0.45, NAVY); g.addColorStop(1, NAVY2);
    hullPath(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); hullPath(); ctx.clip();
    // a white belly band with a teal stripe, sweeping up towards the nose
    ctx.fillStyle = TRIM;
    ctx.beginPath(); ctx.moveTo(-140, 18); ctx.lineTo(140, 18); ctx.lineTo(140, 34); ctx.lineTo(-140, 34); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.scale(front, 1); ctx.fillStyle = ACC;
    ctx.beginPath(); ctx.moveTo(-140, 36); ctx.lineTo(70, 36); ctx.lineTo(140, 6); ctx.lineTo(140, 16); ctx.lineTo(84, 41); ctx.lineTo(-140, 41); ctx.closePath(); ctx.fill();
    ctx.restore();
    // panel seams and rivets
    ctx.strokeStyle = 'rgba(8,14,22,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const px of [-104, -76, 76, 104]) { ctx.moveTo(px, -46); ctx.lineTo(px, 18); ctx.moveTo(px, 41); ctx.lineTo(px, 55); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,220,240,0.35)';
    for (let rx = -124; rx <= 124; rx += 8) { if (Math.abs(rx) > 44) { ctx.fillRect(rx, -41, 1.5, 1.5); ctx.fillRect(rx, 48, 1.5, 1.5); } }
    // round portholes, some lit and some dark
    for (let wx = -116; wx <= 116; wx += 13) {
      if (Math.abs(wx) < 52) continue;
      const lit = (Math.floor(wx / 13) * 7 + Math.floor(t * 0.4)) % 5 !== 0;
      ctx.fillStyle = '#0d1520'; ctx.beginPath(); ctx.arc(wx, -16, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lit ? 'rgba(255,214,140,0.95)' : 'rgba(255,214,140,0.18)'; ctx.beginPath(); ctx.arc(wx, -16, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    // a registry number
    ctx.fillStyle = 'rgba(233,238,243,0.8)'; ctx.font = `800 9px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.textAlign = front > 0 ? 'right' : 'left'; ctx.fillText('ISAAC-3', front * 122, 3);
    ctx.restore();
    hullPath(); ctx.strokeStyle = EDGE; ctx.lineWidth = 2; ctx.stroke();
    // hazard stripes along the lip of the bay
    for (const [lx1, lx2] of [[-58, BAY.x1], [BAY.x2, 58]]) {
      ctx.save(); ctx.beginPath(); ctx.rect(lx1, -46, lx2 - lx1, 5); ctx.clip();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(lx1, -46, lx2 - lx1, 5); ctx.fillStyle = '#1b1f24';
      for (let k = lx1 - 6; k < lx2; k += 6) { ctx.beginPath(); ctx.moveTo(k, -41); ctx.lineTo(k + 3, -46); ctx.lineTo(k + 6, -46); ctx.lineTo(k + 3, -41); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // navigation lights: red on one end, green on the other
    const blink = 0.55 + 0.45 * Math.sin(t * 3);
    for (const [nx, col] of [[-128, '#ff4d4d'], [128, '#3dff8a']]) {
      ctx.fillStyle = col; ctx.globalAlpha = blink; ctx.beginPath(); ctx.arc(nx, -36, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = blink * 0.3; ctx.beginPath(); ctx.arc(nx, -36, 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // the bay: darker inside, with blinking guide lights down its walls
    ctx.fillStyle = 'rgba(6,10,16,0.75)'; ctx.fillRect(BAY.x1, BAY.y1, BAY.x2 - BAY.x1, BAY.y2 - BAY.y1);
    for (let k = 0; k < 4; k++) {
      const on = (Math.floor(t * 4) % 4) === k;
      ctx.fillStyle = on ? COL : rgba(COL, 0.3);
      for (const sx of [BAY.x1 + 3, BAY.x2 - 3]) { ctx.beginPath(); ctx.arc(sx, BAY.y1 + 8 + k * 14, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }
    // target outline and brackets
    const col = c.won ? '#5ee6a0' : COL, ix = IN_BAY.x + SHIP_R;
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2;
    if (!c.won) { ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 16; }
    ctx.strokeRect(-ix + 3, BAY.y1 + 3, 2 * ix - 6, BAY.y2 - BAY.y1 - 6); ctx.setLineDash([]);
    ctx.lineWidth = 3.5; ctx.strokeStyle = col;
    for (const [sx, sy] of [[-1, BAY.y1], [1, BAY.y1]]) {
      ctx.beginPath(); ctx.moveTo(sx * (ix + 2), sy + 14); ctx.lineTo(sx * (ix + 2), sy - 2); ctx.lineTo(sx * (ix - 12), sy - 2); ctx.stroke();
    }
    // settling progress
    if (!c.won && c.still > 0) {
      ctx.strokeStyle = '#5ee6a0'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, (BAY.y1 + BAY.y2) / 2, 46, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * c.still) / SETTLE); ctx.stroke();
    }
    ctx.font = `700 14px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    haloText(ctx, c.won ? 'Docked' : 'Dock here', 0, BAY.y1 - 8, col, 4);
    ctx.restore();
  }

  snap() {
    const c = this.challenge, sp = Math.hypot(this.vx || 0, this.vy || 0), ms = c && c.ms;
    return {
      vx: this.vx || 0, vy: this.vy || 0, speed: sp, fire: this.fire,
      firing: !!(this.fire.up || this.fire.down || this.fire.left || this.fire.right),
      challenge: c ? {
        round: c.round, won: !!c.won, inside: !!c.inside, crash: c.crash != null,
        mvx: ms ? ms.vx : 0, mvy: ms ? ms.vy : 0,
      } : null,
    };
  }
}
