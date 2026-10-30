import React from 'react';

export function pressDir(io, n) { io.order = io.order.filter(x => x !== n); io.order.push(n); }

// A button that acts while it is held down (mouse, pen or finger)
export function HoldButton({ io, name, className, children, label, onPress }) {
  const down = e => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    io.touch[name] = true;
    if (['up', 'down', 'left', 'right'].includes(name)) pressDir(io, name);
    if (onPress) onPress();
  };
  const up = () => { io.touch[name] = false; };
  return (
    <button type="button" className={className} aria-label={label} onPointerDown={down} onPointerUp={up} onPointerCancel={up}
      onLostPointerCapture={up} onContextMenu={e => e.preventDefault()}>{children}</button>
  );
}

