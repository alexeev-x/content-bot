import { AbsoluteFill, useCurrentFrame } from 'remotion';

/** Dark stage with a pulsing glow in the beat's colour and slowly drifting light streaks. */
export function Background({ tint }: { tint: string }) {
  const frame = useCurrentFrame();
  const pulse = 0.55 + 0.15 * Math.sin(frame / 9);
  const drift = (frame * 2.2) % 240;
  return (
    <AbsoluteFill style={{ background: '#06070b', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 62%, ${tint} 0%, transparent 58%)`,
          opacity: pulse
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 120px)',
          backgroundPosition: `${drift}px 0`
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.8) 100%)' }} />
    </AbsoluteFill>
  );
}
