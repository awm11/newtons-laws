// Mode II - Newton's second law, F = m a.
import { PX, MAX_SPEED, MODES, clamp, wrap, rgba, drawSpace, drawShip, drawWrapped, drawBurst, bannerText, haloText, massLabel, fmt, fmtInt, FONT } from './common.js';

const COL = MODES[1].col;
export const LEVEL_N = 500;               // thrust levels 1-4 (keys 1-4) = 500, 1000, 1500, 2000 N
export const LEVELS = 4;
export const MASSES = [
  { m: 500, label: 'Empty', pods: 0, scale: 0.92 },
  { m: 1000, label: 'Cargo', pods: 2, scale: 1 },
  { m: 2000, label: 'Heavy cargo', pods: 4, scale: 1.1 },
];
const HIST = 20;                          // seconds shown on the graph

// Formation challenge: give each ship the force that makes all three accelerate at the same rate.
// Forces come in whole kN, 1 to 10.
export const FORMATION_ROUNDS = [
  // round 1 is the easy one (1 or 2 m/s² both work); rounds 2 and 3 each have exactly one answer: 4, then 2.5 m/s²
  { masses: [1000, 2000, 4000], hint: 'Heavier ships need bigger forces. Adjust the thrust to keep acceleration the same for all three.' },
  { masses: [250, 750, 2500], hint: 'Light ships this time. Only one set of forces keeps them together.' },
  { masses: [400, 2000, 3600], hint: 'This time the acceleration is not a whole number of m/s².' },
];
const START_X = 180;
const LAUNCH_T = 4.5;

export class SecondLaw {
  constructor() { this.W = 960; this.H = 540; this.level = 1; this.massIdx = 1; this.challenge = null; this.reset(); }

  reset() {
    this.place = true; this.vx = 0; this.vy = 0; this.t = 0; this.hist = [{ t: 0, v: 0 }]; this.sampleT = 0;
    this.F = 0; this.dir = null; this.fire = {};
    if (this.challenge) this.resetRound();
  }
  doPlace() { this.x = this.W / 2; this.y = this.H / 2; this.place = false; }

  setChallenge(on, round = 0) {
    this.challenge = on ? { round, sel: 0 } : null;
    if (on) this.resetRound(true); else this.reset();
  }
  resetRound(fresh) {
    const c = this.challenge, r = FORMATION_ROUNDS[c.round];
    const keep = !fresh && c.ships && c.ships.length === 3 ? c.ships.map(s => s.kN) : [1, 1, 1];
    c.ships = r.masses.map((m, i) => ({ m, kN: keep[i], x: START_X }));
    Object.assign(c, { phase: 'set', t: 0, T: 0, success: false, doneAge: 0 });
  }
  setKN(i, kN) { const c = this.challenge; if (c && c.phase === 'set') c.ships[i].kN = clamp(kN, 1, 10); }
  launch() {
    const c = this.challenge; if (!c || c.phase !== 'set') return;
    for (const s of c.ships) s.a = (s.kN * 1000) / s.m;
    const amax = Math.max(...c.ships.map(s => s.a));
    // the race always lasts LAUNCH_T seconds: the fastest ship just reaches the far side
    c.T = LAUNCH_T; c.k = (this.W - START_X - 70) / (0.5 * amax * LAUNCH_T * LAUNCH_T); c.t = 0; c.phase = 'run';
  }

  update(dt, inp) {
    if (this.place) this.doPlace();
    const c = this.challenge;
    if (c) {
      for (const k of inp.pressed) {
        if (c.phase !== 'set') break;
        if (k === 'ArrowUp' || k === 'KeyW') c.sel = (c.sel + 2) % 3;
        else if (k === 'ArrowDown' || k === 'KeyS') c.sel = (c.sel + 1) % 3;
        else if (k === 'ArrowRight' || k === 'KeyD') this.setKN(c.sel, c.ships[c.sel].kN + 1);
        else if (k === 'ArrowLeft' || k === 'KeyA') this.setKN(c.sel, c.ships[c.sel].kN - 1);
        else { const m = /^Digit(\d)$/.exec(k); if (m) this.setKN(c.sel, m[1] === '0' ? 10 : +m[1]); }
      }
      if (c.phase === 'run') {
        c.t = Math.min(c.T, c.t + dt);
        for (const s of c.ships) s.x = START_X + 0.5 * s.a * c.t * c.t * c.k;
        if (c.t >= c.T) {
          c.phase = 'done'; c.doneAge = 0;
          c.success = c.ships.every(s => Math.abs(s.a - c.ships[0].a) < 1e-9);
        }
      } else if (c.phase === 'done') c.doneAge += dt;
      return;
    }

    for (const k of inp.pressed) { const m = /^Digit([1-4])$/.exec(k); if (m) this.level = +m[1]; }
    const { W, H } = this, M = MASSES[this.massIdx].m;
    // only one thruster fires at a time here (the most recently pressed), so F is always the resultant force
    this.dir = inp.last;
    this.F = !this.dir ? 0 : this.level * LEVEL_N;
    this.fire = this.dir ? { [this.dir]: true } : {};
    const a = this.F / M;
    const ux = this.dir === 'right' ? 1 : this.dir === 'left' ? -1 : 0, uy = this.dir === 'down' ? 1 : this.dir === 'up' ? -1 : 0;
    this.vx += ux * a * dt; this.vy += uy * a * dt;
    this.x = wrap(this.x + this.vx * PX * dt, W); this.y = wrap(this.y + this.vy * PX * dt, H);
    this.t += dt; this.sampleT += dt;
    if (this.sampleT >= 0.1) {
      this.sampleT = 0;
      this.hist.push({ t: this.t, v: Math.hypot(this.vx, this.vy) });
      while (this.hist.length && this.hist[0].t < this.t - HIST - 1) this.hist.shift();
    }
  }

  overSpeed() { return !this.challenge && Math.hypot(this.vx || 0, this.vy || 0) > MAX_SPEED; }

  draw(ctx, t) {
    if (this.place) this.doPlace();
    const { W, H } = this, c = this.challenge;
    drawSpace(ctx, W, H, t, COL);
    if (c) { this.drawFormation(ctx, t); return; }
    const ms = MASSES[this.massIdx];
    drawWrapped(this.x, this.y, 60, W, H, (x, y) => {
      drawShip(ctx, x, y, COL, this.fire, t, { pods: ms.pods, scale: ms.scale });
      massLabel(ctx, fmtInt(ms.m) + ' kg', x, y + 40);
    });
  }

  drawFormation(ctx, t) {
    const { W, H } = this, c = this.challenge;
    const ys = [0.24, 0.5, 0.76].map(f => f * H);
    // lanes, start and finish
    ctx.save();
    ctx.strokeStyle = 'rgba(140,190,230,0.16)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 8]);
    for (const y of ys) { ctx.beginPath(); ctx.moveTo(START_X - 45, y); ctx.lineTo(W - 30, y); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = rgba(COL, 0.35); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(START_X, ys[0] - 50); ctx.lineTo(START_X, ys[2] + 50); ctx.stroke();
    ctx.restore();
    // the formation line joins the three ships: dead straight when they keep formation
    const ok = c.phase === 'done' ? c.success : null;
    const lineCol = ok === true ? '#5ee6a0' : ok === false ? '#ff6b5e' : rgba(COL, 0.5);
    ctx.save();
    ctx.strokeStyle = lineCol; ctx.lineWidth = ok === null ? 2 : 3; ctx.setLineDash(ok === null ? [5, 6] : []);
    ctx.beginPath(); c.ships.forEach((s, i) => (i ? ctx.lineTo(s.x, ys[i]) : ctx.moveTo(s.x, ys[i]))); ctx.stroke();
    ctx.restore();

    // the masses, always in view on the left
    c.ships.forEach((s, i) => {
      ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = `700 13px ${FONT}`; haloText(ctx, 'Ship ' + 'ABC'[i], 16, ys[i] - 13, '#9aabb5', 4);
      ctx.font = `800 19px ${FONT}`; haloText(ctx, fmtInt(s.m) + '\u00A0kg', 16, ys[i] + 9, '#e4edf1', 4);
      ctx.restore();
    });
    c.ships.forEach((s, i) => {
      const y = ys[i], pods = clamp(Math.round(s.m / 1000), 0, 4), scale = 0.86 + 0.06 * (s.m / 1000);
      const running = c.phase === 'run';
      if (c.phase === 'set' && i === c.sel) {
        ctx.save(); ctx.strokeStyle = rgba(COL, 0.8); ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 12;
        ctx.beginPath(); ctx.arc(s.x, y, 38 * scale, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      drawShip(ctx, s.x, y, COL, running ? { right: true } : {}, t + i, { pods, scale });
      ctx.save(); ctx.font = `700 15px ${FONT}`; ctx.textBaseline = 'middle';
      if (c.phase === 'set') { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; haloText(ctx, fmtInt(s.kN * 1000) + ' N', s.x, y + 30 * scale + 6, COL, 4); }
      else { ctx.textAlign = 'right'; haloText(ctx, `a = ${fmt(s.a, 2)} m/s²`, s.x - 34 * scale - 8, y - 22, '#e4edf1', 4); }
      ctx.restore();
    });
    if (c.phase === 'done') {
      if (c.success) { drawBurst(ctx, c.ships[1].x, ys[1], c.doneAge, '#5ee6a0'); bannerText(ctx, 'PERFECT FORMATION!', W / 2, H * 0.1, '#5ee6a0', c.doneAge); }
      else bannerText(ctx, 'Out of formation', W / 2, H * 0.1, '#ff8a7e', c.doneAge);
    }
  }

  snap() {
    const c = this.challenge, M = MASSES[this.massIdx].m;
    return {
      F: this.F, m: M, a: this.F / M, speed: Math.hypot(this.vx, this.vy), level: this.level, massIdx: this.massIdx,
      dir: this.dir, t: this.t, hist: this.hist,
      challenge: c ? { round: c.round, sel: c.sel, phase: c.phase, success: c.success, ships: c.ships.map(s => ({ m: s.m, kN: s.kN, a: s.a })) } : null,
    };
  }
}
