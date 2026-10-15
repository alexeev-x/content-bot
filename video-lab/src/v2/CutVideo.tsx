import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BeatView } from './Beats';
import { Captions } from './Captions';
import { buildChunks } from './chunks';
import { flash, shake } from './motion';
import { sec } from './style';
import type { Cut } from './types';

const NO_CAPTIONS = new Set(['slam', 'versus', 'poll']);

export function CutVideo({ cut }: { cut: Cut }) {
  const frame = useCurrentFrame();
  const camera = shake(frame, cut.hits);
  const chunks = buildChunks(cut.words, cut.fixes, cut.accents);
  // Beats that already show the words big (slams, titled renders and icons) hide the captions.
  const hidden = cut.beats
    .filter((beat) => NO_CAPTIONS.has(beat.kind) || ('lines' in beat && beat.lines !== undefined))
    .map((beat) => [beat.from, beat.to] as [number, number]);
  // A whoosh on every cut, an impact on every hit, plus the hand-placed effects.
  const effects = [
    ...cut.beats.slice(1).map((beat) => ({ at: beat.from - 0.12, name: 'whoosh' as const, gain: 0.5 })),
    ...cut.hits.map((at) => ({ at, name: 'impact' as const, gain: 0.8 })),
    ...cut.sfx
  ];
  const progress = frame / sec(cut.duration);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Audio src={staticFile(cut.voice)} />
      <Audio src={staticFile(cut.music)} volume={cut.musicGain} />
      {effects.map((effect, index) => (
        <Sequence key={`${effect.name}-${effect.at}-${index}`} from={Math.max(0, sec(effect.at))} durationInFrames={sec(1.2)}>
          <Audio src={staticFile(`sfx/${effect.name}.wav`)} volume={effect.gain ?? 0.6} />
        </Sequence>
      ))}
      <AbsoluteFill style={{ transform: `translate(${camera.x}px, ${camera.y}px) rotate(${camera.r}deg) scale(1.03)` }}>
        {cut.beats.map((beat) => (
          <Sequence key={`${beat.kind}-${beat.from}`} from={sec(beat.from)} durationInFrames={sec(beat.to) - sec(beat.from)}>
            <BeatView beat={beat} />
          </Sequence>
        ))}
        <Captions chunks={chunks} hidden={hidden} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash(frame, cut.hits), pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, height: 12, width: `${interpolate(progress, [0, 1], [0, 100])}%`, background: 'linear-gradient(90deg,#ffe14d,#ff3d3d)' }} />
    </AbsoluteFill>
  );
}
