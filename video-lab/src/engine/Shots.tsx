import { AbsoluteFill, Img, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { Backdrop } from './Backdrop';
import { Lines } from './Lines';
import { pop, punchScale } from './pop';
import { sec } from './style';
import type { Shot } from './types';

/** One shot; `useCurrentFrame` is relative to the shot's start (it sits in a Sequence). */
export function ShotView({ shot, source }: { shot: Shot; source: string }) {
  const frame = useCurrentFrame();
  const length = sec(shot.to - shot.from);
  // A slow push-in keeps a still or a long clip alive.
  const drift = interpolate(frame, [0, length], [1, 1.06], { extrapolateRight: 'clamp' });

  if (shot.kind === 'clip') {
    const scale = drift * punchScale(frame, (shot.punches ?? []).map((at) => at - shot.from));
    return (
      <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
        <AbsoluteFill style={{ transform: `scale(${scale})` }}>
          <OffthreadVideo
            src={staticFile(source)}
            trimBefore={sec(shot.at)}
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
        {shot.hideBand !== undefined ? (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${(shot.hideBand - 0.035) * 100}%`,
              height: '7%',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              background: 'rgba(0,0,0,0.25)'
            }}
          />
        ) : null}
      </AbsoluteFill>
    );
  }

  if (shot.kind === 'card') {
    return (
      <AbsoluteFill style={{ justifyContent: 'center' }}>
        <Backdrop />
        <AbsoluteFill style={{ justifyContent: 'center', transform: `scale(${drift})` }}>
          <Lines lines={shot.lines} start={shot.from} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const enter = pop(frame, 0);
  const scale = drift * punchScale(frame, (shot.punches ?? []).map((at) => at - shot.from));
  const hasLines = (shot.lines ?? []).length > 0;
  return (
    <AbsoluteFill>
      <Backdrop />
      {hasLines ? (
        <AbsoluteFill style={{ top: 170, justifyContent: 'flex-start' }}>
          <Lines lines={shot.lines ?? []} start={shot.from} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
        <Img
          src={staticFile(shot.src)}
          style={{
            height: `${(shot.height ?? 0.72) * 100}%`,
            objectFit: 'contain',
            transform: `translateY(${(1 - enter) * 120}px) scale(${scale})`,
            transformOrigin: '50% 100%',
            opacity: Math.min(1, enter * 1.5)
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
