# Newton's laws of motion — Vite project

A spaceship in empty space, with one mode for each of Newton's three laws. Each mode has its own colour (amber, magenta, cyan) and Roman numeral, so a teacher can tell at a glance which law each screen is on.

- **I – Inertia (amber):** four fixed thrusters, ghost dots dropped at equal time intervals, a velocity dial. Challenge: *Park it* (three rounds).
- **II – F = ma (magenta):** thrust levels 1–4 (keys 1, 2, 3, 4), three masses, a live F = m × a equation and a speed–time graph. Challenge: *Formation* (three rounds, forces 1–10 kN).
- **III – Action and reaction (cyan):** *Tiny planet* (the spacegirl walks and jumps, contact and gravity force pairs) and *Grapple arm* (hook asteroids, pull or push).

## Setup

```bash
npm install
npm run dev
```

## Structure

- `src/App.jsx` — layout, mode tabs, keyboard/touch input and the animation loop.
- `src/panels.jsx` — the instruments and controls beside the space panel, one per mode.
- `src/common.js` — colours, scales and shared drawing (stars, ship, arrows).
- `src/mode1.js`, `src/mode2.js`, `src/mode3girl.js`, `src/mode3grapple.js` — each mode's physics and drawing.
- `src/styles.css` — all styling (always the dark theme).

## Deploying to GitHub Pages

`REPO_NAME` in `vite.config.js` is `newtons-laws`. Push to `main` and set Pages to "GitHub Actions".

## One law per page

For a classroom, `/#1st-law`, `/#2nd-law` and `/#3rd-law` show just that one law, with no way to switch to the others.
