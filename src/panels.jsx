import React from 'react';
import { MODES, PAIR, fmt, fmtInt, NB } from './common.js';
import { DOCK_ROUNDS } from './mode1.js';
import { MASSES, LEVEL_N, LEVELS, FORMATION_ROUNDS } from './mode2.js';
import { HoldButton } from './input.jsx';

const blur = fn => e => { fn(e); e.currentTarget.blur(); };

// ===== Shared bits =====
// A fixed list of the rules; the ones that apply right now are lit, but nothing appears or disappears
function Rules({ items, active = [] }) {
  return <ul className="rules">{items.map((t, i) => <li key={i} className={active.includes(i) ? 'on' : ''}>{t}</li>)}</ul>;
}
const RULES1 = [
  'When a thruster fires, there is a resultant force, so the velocity changes: the ship speeds up, slows down or turns.',
  'When two opposite thrusters fire together, the forces cancel. The resultant force is zero and the velocity stays the same.',
  'When no thruster fires, there is no resultant force, so the ship keeps moving in a straight line at a steady speed. The ghost dots stay evenly spaced. Nothing is needed to keep it moving.',
  'When the ship is at rest and no force acts, it stays at rest. Fire a thruster to give it a push.',
];
const RULES2 = [
  'When a force acts, the velocity changes every second by the acceleration: a = F \u00F7 m.',
  'When the force doubles, the acceleration doubles.',
  'When the mass doubles, the acceleration halves.',
  'When there is no thrust, F = 0 and a = 0, so the graph is horizontal and the velocity stays the same.',
];
const RULES3A = [
  'When she jumps, her feet push down on the planet and the planet pushes up on her just as hard.',
  'When the masses are different, the same size of force moves the lighter one much more. The planet has 10 times her mass.',
  'When she is in the air, gravity pulls her and the planet together with forces of exactly the same size, so the planet moves back towards her too.',
];
const RULES3B = [
  'When you click an asteroid, the arm hooks it. Try a light asteroid, then the heaviest one.',
  'When the arm pulls, the asteroid pulls the ship towards it just as hard. Both move.',
  'When the arm pushes, the asteroid pushes the ship away just as hard. They fly apart.',
  'When the masses are different, the one with less mass gets the bigger acceleration.',
];

function Fig({ title, className, children, actions }) {
  return (
    <figure className={'fig' + (className ? ' ' + className : '')}>
      {(title || actions) && <div className="fighead">{title && <h2>{title}</h2>}{actions}</div>}
      {children}
    </figure>
  );
}
function Seg({ options, value, onChange, label, className }) {
  return (
    <div className={'segs' + (className ? ' ' + className : '')} role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" className={'seg' + (o.value === value ? ' on' : '')} aria-pressed={o.value === value}
          onClick={blur(() => onChange(o.value))} title={o.title}>{o.label}</button>
      ))}
    </div>
  );
}
const PlayPause = ({ paused, setPaused }) => (
  <button className={'btn pausebtn' + (paused ? ' on' : '')} aria-pressed={paused} onClick={blur(() => setPaused(p => !p))}>
    <svg viewBox="0 0 12 12" aria-hidden="true">
      <path d={paused ? 'M3 1.5 L10.5 6 L3 10.5 Z' : 'M2.5 1.5 h2.6 v9 h-2.6 z M6.9 1.5 h2.6 v9 h-2.6 z'} fill="currentColor" />
    </svg>
    {paused ? 'Play' : 'Pause'}
  </button>
);
const Keys = ({ children }) => <p className="keys">{children}</p>;
const K = ({ children }) => <kbd>{children}</kbd>;
function Rounds({ n, value, onPick, won }) {
  return (
    <div className="rounds" role="group" aria-label="Round">
      {Array.from({ length: n }, (_, i) => (
        <button key={i} type="button" className={'rdot' + (i === value ? ' on' : '') + (won && i === value ? ' won' : '')}
          aria-pressed={i === value} onClick={blur(() => onPick(i))}>{i + 1}</button>
      ))}
    </div>
  );
}

// ===== Mode I =====
function VelocityDial({ vx, vy, speed }) {
  // Direction of travel is shown as a glowing beam from the centre to a marker on the ring:
  // no arrowhead, and every tick is the same, so no direction looks special.
  const cx = 110, cy = 104, R = 84, moving = speed >= 0.005;
  const rad = Math.atan2(vy, vx), at = (a, r) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const ticks = [];
  for (let a = 0; a < 360; a += 10) {
    const r = a * Math.PI / 180, [x1, y1] = at(r, R), [x2, y2] = at(r, R - 5);
    ticks.push(<line key={a} x1={x1} y1={y1} x2={x2} y2={y2} className="tk" />);
  }
  const w = 0.2, [ax, ay] = at(rad - w, R - 4), [bx, by] = at(rad + w, R - 4), [px, py] = at(rad, R);
  return (
    <svg viewBox="0 0 220 252" className="meter" role="img" aria-label={moving ? `Velocity ${fmt(speed, 2)} metres per second` : 'Velocity zero: the ship is at rest'}>
      <defs>
        <radialGradient id="beamGrad" gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={R}>
          <stop offset="0" style={{ stopColor: "var(--mode)", stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: "var(--mode)", stopOpacity: 0.55 }} />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={R} className="dial" />
      <circle cx={cx} cy={cy} r={R * 0.62} className="dial ring2" />
      <circle cx={cx} cy={cy} r={R * 0.3} className="dial ring2" />
      {ticks}
      {moving ? (
        <g className="vbeam">
          <path d={`M${cx},${cy} L${ax},${ay} A${R - 4},${R - 4} 0 0 1 ${bx},${by} Z`} fill="url(#beamGrad)" />
          <line x1={cx} y1={cy} x2={px} y2={py} className="beamline" />
          <circle cx={px} cy={py} r="10" className="pipglow" />
          {/* a small rounded pointer on the ring: just a hint of an arrow */}
          <path className="pip" transform={`rotate(${rad * 180 / Math.PI} ${px} ${py})`}
            d={`M${px + 6},${py} L${px - 6},${py - 6.5} L${px - 3},${py} L${px - 6},${py + 6.5} Z`} />
        </g>
      ) : <text x={cx} y={cy + 32} className="dsub" textAnchor="middle">at rest</text>}
      <circle cx={cx} cy={cy} r="4.5" className="hub" />
      <text x={cx} y={cy + R + 40} className="dval" textAnchor="middle">{speed.toFixed(2)}</text>
      <text x={cx} y={cy + R + 60} className="dunit" textAnchor="middle">m/s</text>
    </svg>
  );
}
function ThrustLamps({ fire }) {
  const a = { up: 'M12 3 L17 9 H7 Z', down: 'M12 21 L17 15 H7 Z', left: 'M3 12 L9 7 V17 Z', right: 'M21 12 L15 7 V17 Z' };
  return (
    <svg viewBox="0 0 24 24" className="lamps" aria-hidden="true">
      {Object.keys(a).map(k => <path key={k} d={a[k]} className={fire[k] ? 'lit' : ''} />)}
      <circle cx="12" cy="12" r="2.6" className="hubl" />
    </svg>
  );
}

export function Mode1Panel({ snap, sim, paused, setPaused, reset, refresh }) {
  const f = snap.fire, nx = (f.right ? 1 : 0) - (f.left ? 1 : 0), ny = (f.down ? 1 : 0) - (f.up ? 1 : 0);
  const net = nx !== 0 || ny !== 0, c = snap.challenge;
  const moving = snap.speed >= 0.005;
  const setCh = (on, round = 0) => { sim.setChallenge(on, round); refresh(); };
  return (
    <>
      <Fig title={c ? 'Velocity relative to the mothership' : 'Velocity'} className="gauges1">
        {c ? (
          <div className="dialcol">
            <VelocityDial vx={snap.vx - c.mvx} vy={snap.vy - c.mvy} speed={Math.hypot(snap.vx - c.mvx, snap.vy - c.mvy)} />
            <dl className="readouts small">
              <div className="rrow"><dt>Your speed</dt><dd><b>{snap.speed.toFixed(2)}{NB}m/s</b></dd></div>
              <div className="rrow"><dt>Mothership speed</dt><dd><b>{Math.hypot(c.mvx, c.mvy).toFixed(2)}{NB}m/s</b></dd></div>
            </dl>
          </div>
        ) : <VelocityDial vx={snap.vx} vy={snap.vy} speed={snap.speed} />}
        <div className="thrustbox">
          <div className={'lamp' + (net ? ' on' : '')}><ThrustLamps fire={f} /><span>Thrust</span></div>
          <dl className="readouts">
            <div className="rrow"><dt>Resultant force</dt><dd><b>{net ? 'Not zero' : 'Zero'}</b></dd></div>
            <div className="rrow"><dt>Velocity</dt><dd><b>{net ? 'Changing' : 'Constant'}</b></dd></div>
          </dl>
        </div>
      </Fig>
      <Fig title="What is happening">
        <Rules items={RULES1} active={[net ? 0 : snap.firing ? 1 : moving ? 2 : 3]} /></Fig>
      <Fig title="Challenge: Mothership" className="challenge" actions={
        <Seg label="Challenge" value={c ? 'on' : 'off'} onChange={v => setCh(v === 'on')} options={[{ value: 'off', label: 'Free flight' }, { value: 'on', label: 'Mothership' }]} />}>
        {c ? (
          <>
            <div className="chrow">
              <Rounds n={3} value={c.round} won={c.won} onPick={i => setCh(true, i)} />
              {c.won ? <span className="pass">Docked!</span> : c.crash ? <span className="fail">Crash! Starting again…</span> : <span className="chnote">Round {c.round + 1} of 3</span>}
            </div>
            <p className="hint">{DOCK_ROUNDS[c.round].hint}{DOCK_ROUNDS[c.round].bare ? ' Touch the hull and you crash.' : <> Stopped means under 0.05{NB}m/s relative to the mothership. Touch the hull and you crash.</>}</p>
            <div className="btnrow">
              <button className="btn ghost" onClick={blur(reset)}>Try again</button>
              {c.won && c.round < 2 && <button className="btn primary" onClick={blur(() => setCh(true, c.round + 1))}>Next round</button>}
            </div>
          </>
        ) : <p className="hint">Dock with a drifting mothership: come to rest relative to it, inside its docking bay. Three rounds.</p>}
      </Fig>
      <div className="deck">
        <PlayPause paused={paused} setPaused={setPaused} />
        {!c && <button className="btn ghost" onClick={blur(reset)}>Reset</button>}
        <Keys><K>←</K><K>↑</K><K>↓</K><K>→</K> or <K>W</K><K>A</K><K>S</K><K>D</K> fire the thrusters</Keys>
      </div>
    </>
  );
}

// ===== Mode II =====
function SpeedGraph({ hist, t }) {
  const GW = 420, GH = 210, L = 42, Rr = 410, Tp = 10, B = GH - 34;
  const t0 = Math.max(0, t - 20), t1 = Math.max(20, t);
  const vis = hist.filter(p => p.t >= t0 - 0.2);
  const vmax0 = Math.max(0.5, ...vis.map(p => p.v));
  const nice = [1, 2, 5, 10, 20, 50, 100, 200].find(n => n >= vmax0 * 1.1) || Math.ceil(vmax0 / 100) * 100;
  const X = tt => L + ((tt - t0) / (t1 - t0)) * (Rr - L), Y = v => B - (v / nice) * (B - Tp);
  const step = nice <= 2 ? nice / 4 : nice / 5;
  const ys = []; for (let v = 0; v <= nice + 1e-9; v += step) ys.push(v);
  const xs = []; for (let s = Math.ceil(t0 / 5) * 5; s <= t1 + 1e-9; s += 5) xs.push(s);
  const d = vis.map((p, i) => `${i ? 'L' : 'M'}${X(Math.max(p.t, t0)).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const lastP = vis[vis.length - 1];
  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} className="tgraph" role="img" aria-label="Graph of speed against time">
      {ys.map(v => <line key={'y' + v} x1={L} x2={Rr} y1={Y(v)} y2={Y(v)} className="grid" />)}
      {xs.map(s => <line key={'x' + s} x1={X(s)} x2={X(s)} y1={Tp} y2={B} className="grid" />)}
      <line x1={L} x2={Rr} y1={B} y2={B} className="axis" /><line x1={L} x2={L} y1={Tp} y2={B} className="axis" />
      {ys.map(v => <text key={'yl' + v} x={L - 7} y={Y(v) + 4} textAnchor="end" className="tick">{fmt(v, 2)}</text>)}
      {xs.map(s => <text key={'xl' + s} x={X(s)} y={B + 16} textAnchor="middle" className="tick">{s}</text>)}
      <text x={(L + Rr) / 2} y={GH - 2} textAnchor="middle" className="atitle">time (s)</text>
      <text x={12} y={(Tp + B) / 2} textAnchor="middle" className="atitle" transform={`rotate(-90 12 ${(Tp + B) / 2})`}>speed (m/s)</text>
      {d && <path d={d} className="vline" />}
      {lastP && <circle cx={X(lastP.t)} cy={Y(lastP.v)} r="4.5" className="vdot" />}
    </svg>
  );
}

function Equation({ F, m, a }) {
  return (
    <div className="eqn" aria-label={`${fmtInt(F)} newtons equals ${fmtInt(m)} kilograms times ${fmt(a)} metres per second squared`}>
      <span className="sym f">F</span><span className="op">=</span><span className="sym m">m</span><span className="op">×</span><span className="sym a">a</span>
      <span className="num f">{fmtInt(F)}</span><span className="op">=</span><span className="num m">{fmtInt(m)}</span><span className="op">×</span><span className="num a">{fmt(a)}</span>
      <span className="unit">N</span><span /><span className="unit">kg</span><span /><span className="unit">m/s²</span>
    </div>
  );
}

function FormationPanel({ snap, sim, refresh }) {
  const c = snap.challenge;
  const setCh = (on, round = 0) => { sim.setChallenge(on, round); refresh(); };
  const setKN = (i, kN) => { sim.setKN(i, kN); sim.challenge.sel = i; refresh(); };
  return (
    <>
      <div className="chrow">
        <Rounds n={3} value={c.round} won={c.phase === 'done' && c.success} onPick={i => setCh(true, i)} />
        <span className="chnote">Round {c.round + 1} of 3</span>
      </div>
      <p className="hint">{FORMATION_ROUNDS[c.round].hint} Then press Launch.</p>
      <div className="ships">
        {c.ships.map((s, i) => (
          <div key={i} className={'shiprow' + (c.sel === i && c.phase === 'set' ? ' sel' : '')}>
            <div className="shiphead">
              <span>Ship {'ABC'[i]} <b>{fmtInt(s.m)}{NB}kg</b></span>
              <b className="fval">{fmtInt(s.kN * 1000)}{NB}N</b>
            </div>
            <div className="bar10" role="group" aria-label={`Force on ship ${'ABC'[i]}`}>
              {Array.from({ length: 10 }, (_, k) => (
                <button key={k} type="button" className={'b' + (k < s.kN ? ' lit' : '')} disabled={c.phase !== 'set'}
                  aria-label={`${k + 1} kilonewtons`} aria-pressed={k + 1 === s.kN} onClick={blur(() => setKN(i, k + 1))}>{k + 1}</button>
              ))}
            </div>
            {c.phase === 'done' && <p className="shipres">a = {fmtInt(s.kN * 1000)} ÷ {fmtInt(s.m)} = <b>{fmt(s.a, 2)}{NB}m/s²</b></p>}
          </div>
        ))}
      </div>
      <div className="btnrow">
        {c.phase === 'set' && <button className="btn primary launch" onClick={blur(() => { sim.launch(); refresh(); })}>Launch</button>}
        {c.phase !== 'set' && <button className={'btn ' + (c.phase === 'done' && !c.success ? 'primary' : 'ghost')} onClick={blur(() => { sim.resetRound(); refresh(); })}>Try again</button>}
        {c.phase === 'done' && c.success && c.round < 2 && <button className="btn primary" onClick={blur(() => setCh(true, c.round + 1))}>Next round</button>}
        {c.phase === 'done' && <span className={c.success ? 'pass' : 'fail'}>{c.success ? 'Perfect formation!' : 'Not the same acceleration'}</span>}
      </div>
      <Keys><K>↑</K><K>↓</K> pick a ship, <K>←</K><K>→</K> or <K>1</K>–<K>9</K>, <K>0</K> set its force</Keys>
    </>
  );
}

export function Mode2Panel({ snap, sim, paused, setPaused, reset, refresh }) {
  const c = snap.challenge;
  const setCh = on => { sim.setChallenge(on, 0); refresh(); };
  const toggle = (
    <Seg label="Challenge" value={c ? 'on' : 'off'} onChange={v => setCh(v === 'on')} options={[{ value: 'off', label: 'Free flight' }, { value: 'on', label: 'Formation' }]} />
  );
  if (c) return (
    <>
      <Fig title="Challenge: Formation" className="challenge" actions={toggle}>
        <FormationPanel snap={snap} sim={sim} refresh={refresh} />
      </Fig>
      <div className="deck"><PlayPause paused={paused} setPaused={setPaused} /></div>
    </>
  );
  const firing = snap.F > 0;
  return (
    <>
      <Fig className="eqfig"><Equation F={snap.F} m={snap.m} a={snap.a} /></Fig>
      <Fig title="Ship settings" className="settings2">
        <div className="setrow">
          <span className="setlbl">Thrust</span>
          <Seg label="Thrust level" value={snap.level} onChange={v => { sim.level = v; refresh(); }}
            options={Array.from({ length: LEVELS }, (_, i) => i + 1).map(l => ({ value: l, label: <>{l === LEVELS ? 'Max' : l}<small>{fmtInt(l * LEVEL_N)}{NB}N</small></>, title: `Key ${l}` }))} className="tall" />
        </div>
        <div className="setrow">
          <span className="setlbl">Mass</span>
          <Seg label="Mass" value={snap.massIdx} onChange={v => { sim.massIdx = v; refresh(); }}
            options={MASSES.map((ms, i) => ({ value: i, label: <>{ms.label}<small>{fmtInt(ms.m)}{NB}kg</small></> }))} className="tall" />
        </div>
      </Fig>
      <Fig title="Speed against time" className="graphfig2" actions={<span className="speedv">{fmt(snap.speed, 2)}{NB}m/s</span>}>
        <div className="gwrap"><SpeedGraph hist={snap.hist} t={snap.t} /></div>
        <Rules items={RULES2} active={firing ? [0] : [3]} />
      </Fig>
      <Fig title="Challenge: Formation" className="challenge" actions={toggle}>
        <p className="hint">Set the force on three ships of different mass so they all accelerate at the same rate. Three rounds.</p>
      </Fig>
      <div className="deck">
        <PlayPause paused={paused} setPaused={setPaused} />
        <button className="btn ghost" onClick={blur(reset)}>Reset</button>
        <Keys><K>←</K><K>↑</K><K>↓</K><K>→</K> fire, <K>1</K><K>2</K><K>3</K> thrust level, <K>4</K> max</Keys>
      </div>
    </>
  );
}

// ===== Mode III =====
function PairLegend({ col }) {
  return (
    <div className="pairleg">
      <svg viewBox="0 0 120 40" aria-hidden="true">
        <g fill={col} stroke={col}>
          <line x1="58" y1="13" x2="18" y2="13" strokeWidth="4.5" /><path d="M6 13 L19 6 L19 20 Z" stroke="none" />
          <line x1="62" y1="27" x2="102" y2="27" strokeWidth="4.5" /><path d="M114 27 L101 20 L101 34 Z" stroke="none" />
        </g>
      </svg>
      <ul><li>Same size</li><li>Opposite directions</li><li>On different objects</li></ul>
    </div>
  );
}

export function Mode3Panel({ snap, sub, setSub, sims, io, paused, setPaused, reset }) {
  const girl = sub === 'girl', g = sims.girl;
  let pairCol = girl ? PAIR.contact : PAIR.arm;
  if (girl && snap.phase === 'fly') pairCol = PAIR.gravity;
  return (
    <>
      <Seg label="Scene" value={sub} onChange={setSub} className="scenes"
        options={[{ value: 'girl', label: 'Tiny planet' }, { value: 'grapple', label: 'Grapple arm' }]} />
      <Fig title={girl && snap.phase === 'fly' ? 'Gravity: a force pair' : girl ? 'Contact: a force pair' : 'The arm: a force pair'}>
        <PairLegend col={pairCol} />
        {girl
          ? <Rules items={RULES3A} active={snap.phase === 'push' || snap.phase === 'crouch' ? [0, 1] : snap.phase === 'fly' ? [2] : []} />
          : <Rules items={RULES3B} active={snap.force > 0 ? [1, 3] : snap.force < 0 ? [2, 3] : [0]} />}
      </Fig>
      {girl ? (
        <div className="deck">
          <button className="btn primary" onClick={blur(() => g.jump())} disabled={snap.phase !== 'stand'}>Jump</button>
          <PlayPause paused={paused} setPaused={setPaused} />
          <button className="btn ghost" onClick={blur(reset)}>Reset</button>
          <label className="swgroup" title="Show the centre of mass of the girl and planet together">
            <span className="insw"><input type="checkbox" defaultChecked={g.showCom} onChange={e => { g.showCom = e.target.checked; e.target.blur(); }} /><span className="track" aria-hidden="true" /></span>
            <span>Centre of mass</span>
          </label>
          <Keys><K>←</K><K>→</K> walk, <K>Space</K> jump</Keys>
        </div>
      ) : (
        <div className="deck">
          <HoldButton io={io} name="pull" className="btn primary holdbtn pullbtn" label="Pull (hold)">Pull</HoldButton>
          <HoldButton io={io} name="push" className="btn primary holdbtn pushbtn" label="Push (hold)">Push</HoldButton>
          <button className="btn ghost" onClick={blur(() => sims.grapple.letGo())} disabled={!snap.arm || snap.arm === 'back'}>Let go</button>
          <span className="pairrow"><PlayPause paused={paused} setPaused={setPaused} />
          <button className="btn ghost" onClick={blur(reset)}>Reset</button></span>
          <Keys>Click an asteroid to hook it. Hold <K>Space</K> to pull, <K>X</K> to push, <K>Z</K> to let go.</Keys>
        </div>
      )}
    </>
  );
}
void MODES;
