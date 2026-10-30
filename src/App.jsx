import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './styles.css';
import { WORLD_W, MODES, drawOverspeed } from './common.js';
import { Inertia } from './mode1.js';
import { SecondLaw } from './mode2.js';
import { Spacegirl } from './mode3girl.js';
import { Grapple } from './mode3grapple.js';
import { Mode1Panel, Mode2Panel, Mode3Panel } from './panels.jsx';
import { HoldButton, pressDir } from './input.jsx';

// ===== Keyboard and touch input =====
const DIR_KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const GAME_KEYS = new Set([...Object.keys(DIR_KEYS), 'Space']);

function makeInput() {
  return { keys: new Set(), order: [], pressed: [], touch: {}, jump: false, release: false };
}
// What the simulation sees this frame
function readInput(io) {
  const d = n => [...io.keys].some(k => DIR_KEYS[k] === n) || !!io.touch[n];
  const dirs = { up: d('up'), down: d('down'), left: d('left'), right: d('right') };
  const held = io.order.filter(n => dirs[n]);
  const out = {
    dirs, last: held.length ? held[held.length - 1] : null, 
    pressed: io.pressed, jump: io.jump, release: io.release,
    pull: io.keys.has('Space') || !!io.touch.pull, push: io.keys.has('KeyX') || !!io.touch.push,
  };
  io.pressed = []; io.jump = false; io.release = false;
  return out;
}

// ===== Small shared components =====
function FullscreenButton() {
  const [isFull, setIsFull] = useState(false);
  const available = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* some embedded browsers refuse full screen */ }
  };
  if (!available) return null;
  return (
    <button type="button" className="btn iconbtn" onClick={e => { toggle(); e.currentTarget.blur(); }}
      aria-label={isFull ? 'Exit full screen' : 'Enter full screen'} title={isFull ? 'Exit full screen' : 'Full screen'}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={isFull ? 'M9 4v5H4 M15 4v5h5 M9 20v-5H4 M15 20v-5h5' : 'M9 4H4v5 M15 4h5v5 M9 20H4v-5 M15 20h5v-5'} />
      </svg>
    </button>
  );
}

const ARROW_PATH = { up: 'M12 5 L19 15 H5 Z', down: 'M12 19 L19 9 H5 Z', left: 'M5 12 L15 5 V19 Z', right: 'M19 12 L9 5 V19 Z' };
function TouchPad({ io, kind }) {
  const pad = (
    <div className="dpad">
      {['up', 'left', 'right', 'down'].map(n => (
        <HoldButton key={n} io={io} name={n} className={'tbtn ' + n} label={'Thruster ' + n}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ARROW_PATH[n]} /></svg>
        </HoldButton>
      ))}
    </div>
  );
  if (kind === 'girl') return (
    <div className="touchpad">
      <div className="walkpad">
        {['left', 'right'].map(n => (
          <HoldButton key={n} io={io} name={n} className="tbtn" label={'Walk ' + n}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ARROW_PATH[n]} /></svg>
          </HoldButton>
        ))}
      </div>
      <HoldButton io={io} name="jumpbtn" className="tbtn wide" label="Jump" onPress={() => { io.jump = true; }}>Jump</HoldButton>
    </div>
  );
  if (kind === 'grapple') return (
    <div className="touchpad">
      {pad}
      <div className="armpad">
        <HoldButton io={io} name="pull" className="tbtn wide pullbtn" label="Pull">Pull</HoldButton>
        <HoldButton io={io} name="push" className="tbtn wide pushbtn" label="Push">Push</HoldButton>
      </div>
    </div>
  );
  return <div className="touchpad">{pad}</div>;
}

// ===== The app =====
const ORD = ['first', 'second', 'third'];
const LEDE = ['a spaceship that coasts until a force acts.', 'how force, mass and acceleration are linked.', 'every force has an equal and opposite partner.'];
const HASHES = ['1st-law', '2nd-law', '3rd-law'];
function lawFromHash() {
  if (typeof window === 'undefined') return null;
  const i = HASHES.indexOf(window.location.hash.replace(/^#\/?/, '').toLowerCase());
  return i < 0 ? null : i + 1;
}

export default function App() {
  // /#1st-law, /#2nd-law and /#3rd-law lock the page to one law, for classrooms
  const [only, setOnly] = useState(() => lawFromHash());
  const [mode, setMode] = useState(() => lawFromHash() || 1);
  const [sub3, setSub3] = useState('girl');
  const [paused, setPaused] = useState(false);
  const [touchUI, setTouchUI] = useState(() => typeof window !== 'undefined' && window.matchMedia('(any-pointer: coarse)').matches);
  const sims = useRef(null);
  if (!sims.current) sims.current = { 1: new Inertia(), 2: new SecondLaw(), girl: new Spacegirl(), grapple: new Grapple() };
  const io = useRef(null);
  if (!io.current) io.current = makeInput();
  const cvRef = useRef(null), stageRef = useRef(null), appRef = useRef(null);
  const live = useRef({});
  const over = useRef(null);   // seconds since the last too-fast reset
  live.current = { mode, sub3, paused };
  const simFor = (m = mode, s = sub3) => sims.current[m === 3 ? s : m];
  const [snap, setSnap] = useState(() => simFor().snap());
  const M = MODES[mode - 1];

  // keyboard
  useEffect(() => {
    const st = io.current;
    const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const kd = e => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      st.keys.add(e.code); st.pressed.push(e.code);
      if (DIR_KEYS[e.code]) pressDir(st, DIR_KEYS[e.code]);
      if (e.code === 'Space') st.jump = true;
      if (e.code === 'KeyZ') st.release = true;
      if (e.code === 'KeyP') setPaused(p => !p);
    };
    const ku = e => { st.keys.delete(e.code); };
    const clear = () => { st.keys.clear(); st.touch = {}; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', clear);
    const tch = () => setTouchUI(true);
    window.addEventListener('touchstart', tch, { once: true, passive: true });
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', clear); window.removeEventListener('touchstart', tch); };
  }, []);

  // the animation loop
  useEffect(() => {
    const cv = cvRef.current, ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = { w: 0, h: 0 };
    const measure = () => { const st = stageRef.current; box.w = st.clientWidth; box.h = st.clientHeight; };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(stageRef.current);
    let raf, last = performance.now(), sized = '';
    const loop = now => {
      const key = box.w + 'x' + box.h;
      if (sized !== key) { cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr); sized = key; }
      const k = (box.w / WORLD_W) * dpr, H = box.w ? (WORLD_W * box.h) / box.w : 540;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
      const { mode: m, sub3: s3, paused: p } = live.current;
      const sim = sims.current[m === 3 ? s3 : m];
      sim.W = WORLD_W; sim.H = H;
      const inp = readInput(io.current);
      if (!p) {
        sim.update(dt, inp);
        // a speed limit: anything faster than MAX_SPEED resets the scene
        if (sim.overSpeed && sim.overSpeed()) { sim.reset(); over.current = 0; }
        if (over.current !== null) { over.current += dt; if (over.current > 2.6) over.current = null; }
      }
      ctx.setTransform(k, 0, 0, k, 0, 0);
      sim.draw(ctx, now / 1000);
      if (over.current !== null) drawOverspeed(ctx, WORLD_W, H, over.current);
      setSnap(sim.snap());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // When the mode changes, the old law rolls up into its tab while the new one unrolls from its own
  const [prevMode, setPrevMode] = useState(null);
  const [lawAfter, setLawAfter] = useState(false);   // the new law waits for the old one to roll up (fixed per switch, so its timing never jumps)
  const lawTimer = useRef(0);
  // Wide screens: fit the whole page to the window so nothing scrolls
  const [fit, setFit] = useState(false);
  useLayoutEffect(() => {
    const check = () => setFit(window.innerWidth > 900 && window.innerHeight >= 560);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const pick = m => {
    if (m === mode) return;
    over.current = null; io.current.order = [];
    setPrevMode(mode); setLawAfter(true); clearTimeout(lawTimer.current);
    lawTimer.current = setTimeout(() => setPrevMode(null), 500);
    setMode(m); setSnap(simFor(m).snap());
  };
  useEffect(() => {
    const onHash = () => { const l = lawFromHash(); setOnly(l); if (l) { setPrevMode(null); setMode(l); setSnap(simFor(l).snap()); } };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => { document.title = only ? `Newton's ${ORD[only - 1]} law` : "Newton's laws of motion"; }, [only]);
  const pickSub = s => { setSub3(s); setSnap(sims.current[s].snap()); };
  const reset = () => { over.current = null; simFor().reset(); setSnap(simFor().snap()); };
  const blurAfter = fn => e => { fn(); e.currentTarget.blur(); };

  // a click or tap in space: used by the grapple arm
  const stageDown = e => {
    if (mode !== 3 || sub3 !== 'grapple' || e.target !== cvRef.current) return;
    const r = cvRef.current.getBoundingClientRect(), sc = WORLD_W / r.width;
    sims.current.grapple.click((e.clientX - r.left) * sc, (e.clientY - r.top) * sc);
  };

  const sim = simFor();
  const padKind = mode === 3 ? sub3 : mode === 2 ? (sim.challenge ? null : 'thrust') : 'thrust';
  const panelProps = { snap, sim, io: io.current, paused, setPaused, reset, refresh: () => setSnap(sim.snap()) };

  return (
    <div className={'app mode' + mode + (fit ? ' fit' : '')} ref={appRef} style={{ '--mode': M.col, '--mode-ink': M.ink }}>
      <header className="top">
        <FullscreenButton />
        <a className="favicon-link" href="/" target="_blank" rel="noopener noreferrer" aria-label="Visit alexmoorephysics.com">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="favicon-img" />
        </a>
        <div className="title-block">
          <h1>{only ? `Newton's ${ORD[only - 1]} law of motion` : "Newton's laws of motion"}</h1>
          <p className="lede">{only ? M.sub + ': ' + LEDE[only - 1] : 'Fly a little spaceship through empty space, one law at a time.'}</p>
        </div>
      </header>

      {only ? (
        <div className="modes single">
          <div className="modetab on static" style={{ '--c': M.col, '--ci': M.ink }}>
            <span className="numeral">{M.num}</span>
            <span className="mtxt"><b>{M.name}</b><small>{M.sub}</small></span>
          </div>
          <div className="lawwrap" style={{ '--mode': M.col }}>
            <div className="lawclip"><p className="law navlaw">{M.law}</p></div>
          </div>
        </div>
      ) : (
      <nav className="modes" aria-label="Choose a law">
        {MODES.map(m => (
          <React.Fragment key={m.id}>
            <button type="button" className={'modetab' + (mode === m.id ? ' on' : '')} style={{ '--c': m.col, '--ci': m.ink }}
              aria-pressed={mode === m.id} onClick={blurAfter(() => pick(m.id))}>
              <span className="numeral">{m.num}</span>
              <span className="mtxt"><b>{m.name}</b><small>{m.sub}</small></span>
            </button>
            {/* the law sits next to its own tab, and unrolls out of it each time the mode changes */}
            {(mode === m.id || prevMode === m.id) && (
              <div key={'law' + m.id + (mode === m.id ? 'in' : 'out')} style={{ '--mode': m.col }}
                className={'lawwrap ' + (mode === m.id ? 'opening' + (lawAfter ? ' after' : '') : 'closing')}
                aria-hidden={mode !== m.id}>
                <div className="lawclip"><p className="law navlaw" aria-live={mode === m.id ? 'polite' : undefined}>{m.law}</p></div>
                <span className="lawroll" aria-hidden="true" />
              </div>
            )}
          </React.Fragment>
        ))}
      </nav>
      )}

      <main className="layout">
        <section className="spacecol">
          <div className="stage" ref={stageRef} onPointerDown={stageDown}>
            <canvas ref={cvRef} role="img" aria-label={`Space panel for Newton's ${M.name.toLowerCase()}`}
              className={mode === 3 && sub3 === 'grapple' ? 'pointable' : ''} />
            <div className="badge" aria-hidden="true"><span>{M.num}</span>{M.name}</div>
            {paused && <div className="pausedtag">Paused</div>}
            {touchUI && padKind && <TouchPad io={io.current} kind={padKind} />}
          </div>
        </section>
        <aside className="lab">
          {mode === 1 && <Mode1Panel {...panelProps} />}
          {mode === 2 && <Mode2Panel {...panelProps} />}
          {mode === 3 && <Mode3Panel {...panelProps} sub={sub3} setSub={pickSub} sims={sims.current} />}
        </aside>
      </main>

      <div className="bottom-block">
        <a className="more-sims" href="/" target="_blank" rel="noopener noreferrer">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="more-sims-icon" />
          <span>See other simulations</span>
        </a>
        <p className="more-sims-note">Click the icon <span className="side-right">on the left</span><span className="side-below">above</span> to explore other interactive physics simulations like this one, or <a href="https://www.buymeacoffee.com/awmPhysics" target="_blank" rel="noopener noreferrer">click here</a> to support the project.</p>
      </div>
    </div>
  );
}
