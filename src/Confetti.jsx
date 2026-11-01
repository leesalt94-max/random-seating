import { useEffect, useState } from 'react';

const COLORS = ['#f8e176', '#ff8a80', '#69f0ae', '#4fc3f7', '#ffffff', '#ce93d8', '#ffb74d'];

export default function Confetti({ burst }) {
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!burst) return;
    setPieces(
      Array.from({ length: 120 }, (_, i) => ({
        id: `${burst}-${i}`,
        left: Math.random() * 100,
        delay: Math.random() * 0.7,
        dur: 2.4 + Math.random() * 1.8,
        color: COLORS[i % COLORS.length],
        drift: (Math.random() - 0.5) * 240,
        rot: Math.random() * 360,
        w: 7 + Math.random() * 7,
      })),
    );
    const t = setTimeout(() => setPieces([]), 5200);
    return () => clearTimeout(t);
  }, [burst]);

  if (!pieces.length) return null;
  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.w * 0.45,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            '--drift': `${p.drift}px`,
            '--rot': `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
