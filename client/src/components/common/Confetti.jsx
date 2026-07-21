import { useMemo } from 'react';

/**
 * Confetti burst on mastering a drop (5th recall) — frontend constraint #4
 * forbids an animation library, so this is CSS keyframes on plain divs rather
 * than canvas or a particle library.
 *
 * Each piece gets a randomised fall duration, horizontal drift, rotation and
 * colour, computed once via `useMemo` so the burst does not re-randomise on
 * every re-render while it plays.
 */
const COLORS = ['#00a3f5', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#38bdf8'];

export function Confetti({ count = 60, active = true }) {
  const pieces = useMemo(() => {
    if (!active) {
      return [];
    }

    return Array.from({ length: count }).map((_, index) => ({
      id: index,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.8 + Math.random() * 1.4,
      color: COLORS[index % COLORS.length],
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 120
    }));
    // Recomputed only when a fresh burst is requested.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, count]);

  if (!active || !pieces.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 0.4,
            backgroundColor: piece.color,
            animation: `confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards`,
            '--drift': `${piece.drift}px`,
            '--rotation': `${piece.rotation}deg`
          }}
        />
      ))}

      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translate3d(0, -10vh, 0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rotation));
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}

export default Confetti;
