import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Chunk } from './chunks';
import { springAt } from './motion';
import { fit, FPS, outlined, TONE } from './style';

/** The current group of words; the word being spoken is yellow and slightly bigger. */
export function Captions({ chunks, hidden }: { chunks: readonly Chunk[]; hidden: readonly [number, number][] }) {
  const frame = useCurrentFrame();
  const now = frame / FPS;
  if (hidden.some(([from, to]) => now >= from && now < to)) return null;
  const chunk = chunks.find((entry) => now >= entry.from && now < entry.to);
  if (chunk === undefined) return null;
  const p = springAt(frame, chunk.from, 11);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: '70%',
          left: 50,
          right: 50,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '6px 30px',
          transform: `translateY(-50%) scale(${0.75 + 0.25 * p})`
        }}
      >
        {chunk.words.map((word, index) => {
          const active = now >= word.s && (chunk.words[index + 1] === undefined || now < chunk.words[index + 1]!.s);
          const color = word.tone ? TONE[word.tone] : active ? TONE.yellow : TONE.white;
          return (
            <span key={`${word.s}`} style={{ ...outlined(fit(word.text, 84, 900), color), display: 'inline-block', transform: active ? 'scale(1.06)' : 'scale(1)' }}>
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
