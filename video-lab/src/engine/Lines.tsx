import { useCurrentFrame } from 'remotion';
import { pop } from './pop';
import { ACCENT, bold, hand } from './style';
import type { CardLine } from './types';

/** Text lines that pop in one by one, each at its word in the voice-over (times relative to the shot). */
export function Lines({ lines, start }: { lines: readonly CardLine[]; start: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 70px' }}>
      {lines.map((line) => {
        const p = pop(frame, line.at - start);
        if (p <= 0.001) return <div key={line.text} style={{ height: (line.size ?? 84) * 1.15 }} />;
        return (
          <div
            key={line.text}
            style={{
              fontFamily: line.font === 'hand' ? hand : bold,
              fontWeight: line.font === 'hand' ? 400 : 900,
              fontSize: line.size ?? 84,
              lineHeight: 1.1,
              textAlign: 'center',
              textTransform: 'uppercase',
              color: ACCENT[line.accent ?? 'white'],
              transform: `scale(${0.6 + 0.4 * p}) translateY(${(1 - p) * 30}px)`,
              opacity: Math.min(1, p * 1.4),
              textShadow: '0 6px 24px rgba(0,0,0,0.6)'
            }}
          >
            {line.text}
          </div>
        );
      })}
    </div>
  );
}
