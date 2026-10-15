import type { CSSProperties } from 'react';
import { AbsoluteFill, Img, interpolate, Loop, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { Background } from './Background';
import { springAt } from './motion';
import { fitWords, font, outlined, sec, TONE } from './style';
import type { Beat, Line } from './types';

/** Lines that slam in on their word; `start` is the beat start, so times stay in voice seconds. */
function Lines({ lines, start, top }: { lines: readonly Line[]; start: number; top: number | 'center' }) {
  const frame = useCurrentFrame();
  const place: CSSProperties =
    top === 'center' ? { top: 0, bottom: 0, justifyContent: 'center' } : { top };
  return (
    <div style={{ position: 'absolute', left: 40, right: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, ...place }}>
      {lines.map((line) => {
        const p = springAt(frame, line.at - start, 10);
        return (
          <div
            key={line.text}
            style={{
              ...outlined(fitWords(line.text, line.size ?? 96), TONE[line.tone ?? 'white']),
              textAlign: 'center',
              opacity: p > 0.02 ? 1 : 0,
              transform: `scale(${1.3 - 0.3 * p}) rotate(${(1 - p) * -5}deg)`
            }}
          >
            {line.text}
          </div>
        );
      })}
    </div>
  );
}

/** Every beat enters with a fast zoom-blur, the cut style of current gaming shorts. */
function Enter({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const t = Math.min(1, frame / 7);
  const style: CSSProperties = {
    transform: `scale(${1.22 - 0.22 * t})`,
    filter: t < 1 ? `blur(${(1 - t) * 16}px)` : undefined
  };
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

export function BeatView({ beat }: { beat: Beat }) {
  const frame = useCurrentFrame();
  const length = sec(beat.to - beat.from);

  if (beat.kind === 'hero') {
    const p = springAt(frame, 0, 13);
    const float = Math.sin(frame / 14) * 12;
    return (
      <Enter>
        <Background tint={beat.tint} />
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 1500 * (beat.scale ?? 1), height: 1500 * (beat.scale ?? 1), marginBottom: -160, transform: `translateY(${(1 - p) * 300 + float}px)` }}>
            <Loop durationInFrames={sec(beat.loop)} layout="none">
              <OffthreadVideo transparent muted src={staticFile(beat.hero)} style={{ width: '100%' }} />
            </Loop>
          </div>
        </AbsoluteFill>
        {beat.lines ? <Lines lines={beat.lines} start={beat.from} top={230} /> : null}
      </Enter>
    );
  }

  if (beat.kind === 'icons') {
    const size = beat.icons.length > 3 ? 290 : beat.icons.length > 1 ? 310 : 620;
    return (
      <Enter>
        <Background tint={beat.tint} />
        {beat.lines ? <Lines lines={beat.lines} start={beat.from} top={240} /> : null}
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', top: 420, bottom: 300 }}>
          <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap', justifyContent: 'center', width: 980 }}>
            {beat.icons.map((icon, index) => {
              const p = springAt(frame, icon.at - beat.from, 9);
              const wobble = Math.sin((frame + index * 7) / 6) * 3;
              return (
                <div key={icon.src} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, opacity: p > 0.02 ? 1 : 0, transform: `scale(${p}) rotate(${wobble}deg)` }}>
                  <Img
                    src={staticFile(icon.src)}
                    style={{ width: size, height: size * 0.73, objectFit: 'cover', borderRadius: 22, border: '5px solid rgba(255,255,255,0.85)', boxShadow: `0 0 60px ${beat.tint}` }}
                  />
                  {icon.label ? <div style={outlined(48, '#fff')}>{icon.label}</div> : null}
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </Enter>
    );
  }

  if (beat.kind === 'clip') {
    const zoom = interpolate(frame, [0, length], [1.04, 1.16]);
    return (
      <Enter>
        <AbsoluteFill style={{ background: '#000' }}>
          <OffthreadVideo muted src={staticFile(beat.src)} trimBefore={sec(beat.at)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.45)', transform: 'scale(1.2)' }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ top: 250, height: 1100, alignItems: 'center' }}>
          <div style={{ width: 1040, height: 1100, borderRadius: 34, overflow: 'hidden', border: `5px solid ${beat.tint}`, boxShadow: `0 0 70px ${beat.tint}` }}>
            <OffthreadVideo muted src={staticFile(beat.src)} trimBefore={sec(beat.at)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }} />
          </div>
        </AbsoluteFill>
      </Enter>
    );
  }

  if (beat.kind === 'slam') {
    return (
      <Enter>
        <Background tint={beat.tint} />
        <AbsoluteFill style={{ justifyContent: 'center' }}>
          <Lines lines={beat.lines} start={beat.from} top="center" />
        </AbsoluteFill>
      </Enter>
    );
  }

  if (beat.kind === 'versus') {
    return (
      <Enter>
        <Background tint="#401018" />
        <AbsoluteFill style={{ justifyContent: 'center', gap: 70, padding: '0 60px' }}>
          {beat.rows.map((row) => {
            const p = springAt(frame, row.at - beat.from, 11);
            return (
              <div key={row.cause} style={{ opacity: p > 0.02 ? 1 : 0, transform: `translateX(${(1 - p) * 500}px)`, textAlign: 'center' }}>
                <div style={outlined(fitWords(row.cause, 84), '#fff')}>{row.cause}</div>
                <div style={{ ...outlined(fitWords(row.verdict, 150), TONE[row.tone]), marginTop: 12 }}>{row.verdict}</div>
              </div>
            );
          })}
        </AbsoluteFill>
      </Enter>
    );
  }

  // poll: a Telegram-like vote card for the next hero, the call to action of the rubric.
  return (
    <Enter>
      <Background tint="#1d6fd6" />
      <AbsoluteFill style={{ alignItems: 'center', top: 260 }}>
        <div style={{ ...outlined(84, '#fff'), textAlign: 'center', width: 960, lineHeight: 1.1 }}>{beat.title}</div>
        <div style={{ marginTop: 50, width: 900, borderRadius: 36, background: 'rgba(20,28,40,0.92)', padding: 36, display: 'flex', flexDirection: 'column', gap: 24, border: '3px solid #2aa3ff' }}>
          <div style={{ fontFamily: font, fontWeight: 800, fontSize: 40, color: '#5fb6ff' }}>Telegram · опрос</div>
          {beat.heroes.map((hero, index) => {
            const p = springAt(frame, 0.25 + index * 0.18, 12);
            const fill = interpolate(frame, [12, 45], [0, [62, 18, 12, 8][index] ?? 10], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div key={hero.name} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 24, height: 110, borderRadius: 20, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', opacity: p, transform: `translateY(${(1 - p) * 60}px)` }}>
                <div style={{ position: 'absolute', inset: 0, width: `${fill}%`, background: 'rgba(42,163,255,0.35)' }} />
                <Img src={staticFile(hero.src)} style={{ height: 110, width: 196, objectFit: 'cover', position: 'relative' }} />
                <div style={{ fontFamily: font, fontWeight: 800, fontSize: 48, color: '#fff', position: 'relative' }}>{hero.name}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Enter>
  );
}
