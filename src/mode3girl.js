// Mode III (a) - the spacegirl jumps off her tiny planet.
// Her feet push the planet away while the planet pushes her up; then gravity pulls them back together.
// Each pair of forces is drawn as two arrows of the same size pointing in opposite directions.
import { MODES, PAIR, clamp, drawSpace, drawArrow, arrowLabel, haloText, FONT } from './common.js';

const COL = MODES[2].col;
const MG = 1, MP = 10;                   // the planet has 10 times her mass
const MU = (MG * MP) / (MG + MP);
const GMT = 2.0e6;                       // G (m + M), in canvas units
const GC = GMT / (MG + MP);
const R = 44;                            // planet radius
const H_STAND = 17, H_CROUCH = 8;        // her centre of mass above her feet
const CROUCH = 0.08, PUSH = 0.12;        // seconds (game time) to crouch and to push off
const SLOW = 0.2;                        // time runs at a fifth of normal speed while she pushes off
const WALK = 1.5;                        // rad/s around the planet
const ARROW_CONTACT = 40, ARROW_GRAV = 34;
const ZOOM = 1.45;                       // this scene is drawn larger than the others
const LBL = 11;                          // label size before zooming

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

export class Spacegirl {
  constructor() { this.W = 960; this.H = 540; this.showCom = false; this.reset(); }

  reset() {
    this.place = true; this.phase = 'stand'; this.th = -Math.PI / 2; this.walkPh = 0; this.walking = 0;
    this.Pv = { x: 0, y: 0 }; this.Gv = { x: 0, y: 0 }; this.contactA = 0; this.gravA = 0;
    this.timeScale = 1; this.phT = 0; this.landAge = 9; this.P0 = null; this.ghostA = 0;
  }
  get w() { return this.W / ZOOM; }
  get h() { return this.H / ZOOM; }
  doPlace() {
    this.P = { x: this.w / 2, y: this.h * 0.55 };
    this.standOn(); this.place = false;
  }
  u() { return { x: Math.cos(this.th), y: Math.sin(this.th) }; }
  standOn() { const u = this.u(); this.G = { x: this.P.x + u.x * (R + H_STAND), y: this.P.y + u.y * (R + H_STAND) }; }

  jump() {
    if (this.place) this.doPlace();
    if (this.phase !== 'stand') return;
    // a fixed-strength jump: enough to rise a good way, never enough to escape
    const r0 = R + H_STAND, rmax = r0 + clamp(0.5 * Math.min(this.w, this.h) - r0 - 12, 60, 150);
    const v = Math.sqrt(2 * GMT * (1 / r0 - 1 / rmax));
    this.Fpush = MU * (v / PUSH + GMT / (r0 * r0));
    this.ju = this.u(); this.P0 = { ...this.P };
    this.phase = 'crouch'; this.phT = 0; this.timeScale = SLOW;
  }

  update(realDt, inp) {
    if (this.place) this.doPlace();
    if (inp.jump) this.jump();
    // slow motion during the push-off, easing back to normal speed afterwards
    if (this.phase === 'crouch' || this.phase === 'push') this.timeScale = SLOW;
    else this.timeScale = Math.min(1, this.timeScale + realDt / 0.35);
    const dt = realDt * this.timeScale;
    this.contactA = this.phase === 'push' ? 1 : Math.max(0, this.contactA - realDt / 0.7);
    this.gravA = this.phase === 'fly' ? Math.min(1, this.gravA + realDt / 0.25) : Math.max(0, this.gravA - realDt / 0.25);
    this.landAge += realDt;
    this.ghostA = this.phase === 'fly' || this.phase === 'push' ? Math.min(1, this.ghostA + realDt / 0.3) : Math.max(0, this.ghostA - realDt / 0.8);

    if (this.phase === 'stand') {
      const d = (inp.dirs.right ? 1 : 0) - (inp.dirs.left ? 1 : 0);
      this.walking = d;
      if (d) { this.th += d * WALK * realDt; this.walkPh += realDt * 9; }
      this.standOn();
      return;
    }
    this.walking = 0;
    if (this.phase === 'crouch') {
      this.phT += dt;
      const k = clamp(this.phT / CROUCH, 0, 1), h = H_STAND + (H_CROUCH - H_STAND) * k, u = this.ju;
      this.G = { x: this.P.x + u.x * (R + h), y: this.P.y + u.y * (R + h) };
      if (this.phT >= CROUCH) { this.phase = 'push'; this.phT = 0; }
      return;
    }
    const n = 8, h = dt / n;
    for (let i = 0; i < n; i++) {
      const d = sub(this.G, this.P), r = Math.hypot(d.x, d.y), ux = d.x / r, uy = d.y / r;
      const fg = (GC * MG * MP) / (r * r);
      let fx = -ux * fg, fy = -uy * fg;                       // force on the girl (the planet gets the opposite)
      if (this.phase === 'push') { fx += this.ju.x * this.Fpush; fy += this.ju.y * this.Fpush; }
      this.Gv.x += (fx / MG) * h; this.Gv.y += (fy / MG) * h;
      this.Pv.x -= (fx / MP) * h; this.Pv.y -= (fy / MP) * h;
      this.G.x += this.Gv.x * h; this.G.y += this.Gv.y * h;
      this.P.x += this.Pv.x * h; this.P.y += this.Pv.y * h;
      if (this.phase === 'push') {
        this.phT += h;
        if (this.phT >= PUSH) { this.phase = 'fly'; this.phT = 0; }
      } else if (this.phase === 'fly') {
        this.phT += h;
        const d2 = sub(this.G, this.P), r2 = Math.hypot(d2.x, d2.y);
        const vr = ((this.Gv.x - this.Pv.x) * d2.x + (this.Gv.y - this.Pv.y) * d2.y) / r2;
        if (r2 <= R + H_STAND && vr < 0 && this.phT > 0.1) { this.land(); break; }
      }
    }
  }
  land() {
    // they stick together: momentum is shared, and the total was zero to begin with
    const vx = (MG * this.Gv.x + MP * this.Pv.x) / (MG + MP), vy = (MG * this.Gv.y + MP * this.Pv.y) / (MG + MP);
    this.Gv = { x: vx, y: vy }; this.Pv = { x: vx, y: vy };
    const d = sub(this.G, this.P); this.th = Math.atan2(d.y, d.x);
    this.phase = 'stand'; this.landAge = 0; this.standOn();
    this.Gv = { x: 0, y: 0 }; this.Pv = { x: 0, y: 0 };
  }

  draw(ctx, t) {
    if (this.place) this.doPlace();
    const { W, H } = this;
    drawSpace(ctx, W, H, t, COL, false);
    ctx.save(); ctx.scale(ZOOM, ZOOM);
    // where the planet started, so its recoil is easy to see
    if (this.P0 && this.ghostA > 0) {
      ctx.save(); ctx.globalAlpha = 0.55 * this.ghostA; ctx.strokeStyle = 'rgba(232,184,119,0.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.arc(this.P0.x, this.P0.y, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(232,184,119,0.8)'; ctx.beginPath(); ctx.arc(this.P0.x, this.P0.y, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawPlanet(ctx, this.P.x, this.P.y, t);
    this.drawGirl(ctx, t);

    const d = sub(this.G, this.P), r = Math.hypot(d.x, d.y), u = { x: d.x / r, y: d.y / r };
    // contact force pair, at the point where her feet touch the planet
    if (this.contactA > 0) {
      const ju = this.ju || u, jp = { x: -ju.y, y: ju.x };
      const C = { x: this.P.x + ju.x * R, y: this.P.y + ju.y * R };
      const off = 15;
      drawArrow(ctx, C.x + jp.x * off, C.y + jp.y * off, ju.x, ju.y, ARROW_CONTACT, PAIR.contact, this.contactA, 3.4);
      drawArrow(ctx, C.x - jp.x * off, C.y - jp.y * off, -ju.x, -ju.y, ARROW_CONTACT, PAIR.contact, this.contactA, 3.4);
      arrowLabel(ctx, C.x + jp.x * off, C.y + jp.y * off, ju.x, ju.y, ARROW_CONTACT, 'Planet pushes girl', PAIR.contact, this.contactA, 1, LBL);
      arrowLabel(ctx, C.x - jp.x * off, C.y - jp.y * off, -ju.x, -ju.y, ARROW_CONTACT, 'Girl pushes planet', PAIR.contact, this.contactA, 1, LBL);
    }
    // gravitational pair: equal and opposite, a fixed size while she flies
    if (this.gravA > 0) {
      drawArrow(ctx, this.G.x, this.G.y, -u.x, -u.y, ARROW_GRAV, PAIR.gravity, this.gravA, 3.4);
      drawArrow(ctx, this.P.x, this.P.y, u.x, u.y, ARROW_GRAV, PAIR.gravity, this.gravA, 3.4);
      arrowLabel(ctx, this.G.x, this.G.y, -u.x, -u.y, ARROW_GRAV, 'Planet pulls girl', PAIR.gravity, this.gravA, 1, LBL);
      arrowLabel(ctx, this.P.x, this.P.y, u.x, u.y, ARROW_GRAV, 'Girl pulls planet', PAIR.gravity, this.gravA, -1, LBL);
    }
    if (this.showCom) {
      const cx = (MG * this.G.x + MP * this.P.x) / (MG + MP), cy = (MG * this.G.y + MP * this.P.y) / (MG + MP);
      drawCom(ctx, cx, cy);
    }
    ctx.restore();
  }

  drawGirl(ctx, t) {
    const flying = this.phase === 'push' || this.phase === 'fly';
    const u = flying || this.phase === 'crouch' ? this.ju : this.u();
    // her feet stay on the ground until she has pushed off
    let feet, hc;
    if (this.phase === 'fly') { hc = H_STAND; feet = { x: this.G.x - u.x * hc, y: this.G.y - u.y * hc }; }
    else {
      feet = { x: this.P.x + u.x * R, y: this.P.y + u.y * R };
      hc = Math.hypot(this.G.x - feet.x, this.G.y - feet.y);
      if (hc > H_STAND + 2) { feet = { x: this.G.x - u.x * (H_STAND + 2), y: this.G.y - u.y * (H_STAND + 2) }; hc = H_STAND + 2; }
    }
    const squash = this.landAge < 0.22 ? Math.sin((this.landAge / 0.22) * Math.PI) * 3 : 0;
    hc -= squash;
    ctx.save();
    ctx.translate(feet.x, feet.y); ctx.rotate(Math.atan2(u.y, u.x) + Math.PI / 2);
    const hip = -(hc - 5), sh = hip - 11, head = sh - 7;
    const sw = this.walking ? Math.sin(this.walkPh) * 4 : 0, fly = this.phase === 'fly';
    // she faces the way she walks; her life-support pack sits on her back
    const back = this.walking ? -this.walking : -1;
    const SUIT = '#eef2f6', SEAM = '#7f8fa0';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // backpack
    ctx.fillStyle = '#c9d2dc'; ctx.strokeStyle = SEAM; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.roundRect(back > 0 ? 3.2 : -9.2, sh - 0.5, 6, 11, 1.8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL; ctx.fillRect(back > 0 ? 5.2 : -7.2, sh + 2, 2, 2);
    // legs and boots
    ctx.strokeStyle = SEAM; ctx.lineWidth = 4.6;
    ctx.beginPath(); ctx.moveTo(-2.5, hip); ctx.lineTo(-3 + sw, -1); ctx.moveTo(2.5, hip); ctx.lineTo(3 - sw, -1); ctx.stroke();
    ctx.strokeStyle = SUIT; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(-2.5, hip); ctx.lineTo(-3 + sw, -1); ctx.moveTo(2.5, hip); ctx.lineTo(3 - sw, -1); ctx.stroke();
    ctx.fillStyle = '#4a5866';
    ctx.beginPath(); ctx.ellipse(-3 + sw, -0.6, 3, 2, 0, 0, Math.PI * 2); ctx.ellipse(3 - sw, -0.6, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
    // suit body, with a stripe in the mode's colour and a chest panel
    ctx.fillStyle = SUIT; ctx.strokeStyle = SEAM; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.roundRect(-5.4, sh - 0.5, 10.8, hip - sh + 3, 3.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL; ctx.fillRect(-5.4, hip - 1.2, 10.8, 1.8);
    ctx.fillStyle = '#9fb0c0'; ctx.beginPath(); ctx.roundRect(-2.6, sh + 2.4, 5.2, 3.4, 0.8); ctx.fill();
    ctx.fillStyle = '#ff6b5e'; ctx.beginPath(); ctx.arc(-1.1, sh + 4.1, 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5ee6a0'; ctx.beginPath(); ctx.arc(1.1, sh + 4.1, 0.7, 0, Math.PI * 2); ctx.fill();
    // arms: back while crouching, up while flying
    const crouch = this.phase === 'crouch';
    for (const s of [-1, 1]) {
      const swing = this.walking ? s * Math.sin(this.walkPh) * 0.35 : 0;
      const a = fly ? -2.5 : crouch ? 0.9 : 0.25 + swing;
      const hx = s * (4.6 + Math.sin(Math.abs(a)) * 6), hy = sh + 1.5 + Math.cos(a) * 9;
      ctx.strokeStyle = SEAM; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.moveTo(s * 4.4, sh + 1.5); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = SUIT; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s * 4.4, sh + 1.5); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = COL; ctx.beginPath(); ctx.arc(hx, hy, 1.9, 0, Math.PI * 2); ctx.fill();   // gloves
    }
    // collar ring
    ctx.fillStyle = '#c9d2dc'; ctx.strokeStyle = SEAM; ctx.beginPath(); ctx.ellipse(0, sh - 0.3, 5.2, 1.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // her face and hair, inside the helmet
    ctx.fillStyle = '#f5c542';
    ctx.beginPath(); ctx.ellipse(back * 4.6, head + 1.6, 2.4, 3.2, back * 0.3, 0, Math.PI * 2); ctx.fill();   // ponytail, tucked in
    ctx.fillStyle = '#f2c9a8'; ctx.beginPath(); ctx.arc(0, head, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(0, head - 0.8, 4.8, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
    ctx.fillStyle = '#1a2233'; ctx.beginPath(); ctx.arc(-1.6, head + 0.6, 0.7, 0, Math.PI * 2); ctx.arc(1.6, head + 0.6, 0.7, 0, Math.PI * 2); ctx.fill();
    // the helmet: a glass bubble with a rim, a glint and a little antenna light
    const hg = ctx.createRadialGradient(-2.5, head - 3, 0.5, 0, head, 8);
    hg.addColorStop(0, 'rgba(255,255,255,0.35)'); hg.addColorStop(0.6, 'rgba(160,220,255,0.12)'); hg.addColorStop(1, 'rgba(160,220,255,0.28)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, head, 7.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#dfe7ee'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, head, 5.8, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
    ctx.strokeStyle = SEAM; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(back * 4.5, head - 6); ctx.lineTo(back * 6.5, head - 10); ctx.stroke();
    ctx.fillStyle = (Math.sin(t * 4) > 0) ? COL : 'rgba(47,227,255,0.35)';
    ctx.beginPath(); ctx.arc(back * 6.5, head - 10.4, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  snap() { return { phase: this.phase, slow: this.timeScale < 0.99 }; }
}

function drawPlanet(ctx, x, y, t) {
  ctx.save(); ctx.translate(x, y);
  const gl = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.6);
  gl.addColorStop(0, 'rgba(255,190,120,0.18)'); gl.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, Math.PI * 2); ctx.fill();
  // a little volcano and a flower on the surface
  const deco = (ang, fn) => { ctx.save(); ctx.rotate(ang + Math.PI / 2); ctx.translate(0, -R + 1); fn(); ctx.restore(); };
  deco(-2.35, () => {
    ctx.fillStyle = '#8a5a3c'; ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-4, -9); ctx.lineTo(4, -9); ctx.lineTo(10, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff7a45'; ctx.beginPath(); ctx.ellipse(0, -9, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,220,230,0.5)'; ctx.beginPath(); ctx.arc(2 + Math.sin(t) * 2, -15 - (t * 6 % 10), 2.5, 0, Math.PI * 2); ctx.fill();
  });
  // a flag planted in the ground, stirring gently
  deco(-0.75, () => {
    ctx.strokeStyle = '#dfe7ee'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -19); ctx.stroke();
    ctx.fillStyle = '#dfe7ee'; ctx.beginPath(); ctx.arc(0, -19.5, 1.3, 0, Math.PI * 2); ctx.fill();
    // the cloth ripples along its length
    const wv = k => Math.sin(t * 3.2 - k * 0.55) * 1.3 * (k / 12);
    ctx.fillStyle = COL; ctx.strokeStyle = 'rgba(0,42,51,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0.7, -18.5);
    for (let k = 1; k <= 12; k++) ctx.lineTo(0.7 + k, -18.5 + wv(k));
    for (let k = 12; k >= 0; k--) ctx.lineTo(0.7 + k, -11 + wv(k));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // a small star on the flag
    ctx.fillStyle = '#ffffff'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.1 : 2.6, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(6.5 + Math.cos(a) * r, -14.8 + wv(6) + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  });
  const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
  g.addColorStop(0, '#f6d29a'); g.addColorStop(0.6, '#d9a066'); g.addColorStop(1, '#9c6a3c');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6e4627'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(110,70,39,0.35)';
  for (const [cx, cy, cr] of [[-14, 10, 7], [12, -14, 5], [16, 14, 4], [-4, -22, 3.5], [-24, -6, 3]]) { ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function drawCom(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#05080f'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#05080f';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 6.5, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 6.5, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
  ctx.font = `700 12px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  haloText(ctx, 'centre of mass', x + 11, y, '#e4edf1', 4);
  ctx.restore();
}
