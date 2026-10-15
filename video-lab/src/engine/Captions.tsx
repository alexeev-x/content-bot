import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { pop } from './pop';
import { ACCENT, bold, FPS, hand, sec } from './style';
import type { Caption } from './types';

/** One short caption at a time, popping in on its word; white with a heavy outline so it reads on gameplay. */
export function Captions({ captions, y, font }: { captions: readonly Caption[]; y: number; font: 'bold' | 'hand' }) {
  const frame = useCurrentFrame();
  const now = frame / FPS;
  const current = captions.find((caption) => now >= caption.from && now < caption.to);
  if (current === undefined) return null;
  const p = pop(frame - sec(current.from), 0);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: `${(current.y ?? y) * 100}%`,
          transform: `translateY(-50%) scale(${0.7 + 0.3 * p})`,
          textAlign: 'center',
          fontFamily: font === 'hand' ? hand : bold,
          fontWeight: font === 'hand' ? 400 : 900,
          fontSize: font === 'hand' ? 92 : 70,
          lineHeight: 1.1,
          textTransform: 'uppercase',
          color: ACCENT[current.accent ?? 'white'],
          WebkitTextStroke: '10px #000',
          paintOrder: 'stroke fill',
          textShadow: '0 8px 26px rgba(0,0,0,0.65)',
          opacity: Math.min(1, p * 1.6)
        }}
      >
        {current.text}
      </div>
    </AbsoluteFill>
  );
}
