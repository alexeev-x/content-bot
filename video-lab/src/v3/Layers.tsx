import { AbsoluteFill, Img, interpolate, Loop, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { ACCENT, font, FPS, glow, INK, presence, sec } from './look';
import type { Layer, Phrase } from './types';

/** Letters fade in left to right with a little blur, like the references' typing reveal. */
function PhraseView({ phrase, frame }: { phrase: Phrase; frame: number }) {
  const start = sec(phrase.at);
  const words = phrase.text.split(' ');
  let index = 0;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 0.32em' }}>
      {words.map((word, w) => {
        const accented = phrase.accent?.words.includes(word.toLowerCase().replace(/[?!,.]/g, ''));
        const color = accented && phrase.accent ? ACCENT[phrase.accent.color] : INK;
        return (
          <span key={`${word}-${w}`} style={{ whiteSpace: 'nowrap' }}>
            {[...word].map((letter) => {
              const t = interpolate(frame, [start + index * 0.6, start + index * 0.6 + 5], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp'
              });
              index += 1;
              return (
                <span
                  key={index}
                  style={{ display: 'inline-block', opacity: t, filter: t < 1 ? `blur(${(1 - t) * 6}px)` : undefined, color, textShadow: glow(color) }}
                >
                  {letter}
                </span>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

export function LayerView({ layer }: { layer: Layer }) {
  const frame = useCurrentFrame();
  const from = sec(layer.from);
  const to = sec(layer.to);
  const p = presence(frame, from, to);
  if (p <= 0) return null;
  const float = Math.sin(frame / 22) * 8;

  if (layer.kind === 'text') {
    return (
      <AbsoluteFill style={{ top: `${(layer.y ?? 0.42) * 100}%`, height: 'auto', bottom: 'auto', padding: '0 80px', opacity: p }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, alignItems: 'center', transform: `translateY(-50%) translateY(${(1 - p) * 20}px)`, fontFamily: font, fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
          {layer.phrases
            .filter((phrase) => frame >= sec(phrase.at) - 1)
            .map((phrase) => (
              <div key={phrase.text} style={{ fontSize: phrase.size ?? 62, lineHeight: 1.15, letterSpacing: '0.01em' }}>
                <PhraseView phrase={phrase} frame={frame} />
              </div>
            ))}
        </div>
      </AbsoluteFill>
    );
  }

  if (layer.kind === 'hero') {
    const width = layer.width ?? 1150;
    const x = layer.side === 'left' ? -width * 0.22 : 1080 - width * 0.88;
    return (
      <div style={{ position: 'absolute', left: x, bottom: -width * 0.12, width, height: width, opacity: p, transform: `translateX(${(1 - p) * (layer.side === 'left' ? -120 : 120)}px) translateY(${float}px)` }}>
        <Loop durationInFrames={sec(layer.loop)} layout="none">
          <OffthreadVideo transparent muted src={staticFile(layer.src)} style={{ width: '100%', height: '100%' }} />
        </Loop>
      </div>
    );
  }

  if (layer.kind === 'window') {
    const tilt = layer.tilt ?? 8;
    return (
      <AbsoluteFill style={{ perspective: 1600, alignItems: 'center', top: `${(layer.y ?? 0.5) * 100}%`, height: 'auto', bottom: 'auto' }}>
        <div
          style={{
            width: 900,
            height: 760,
            marginTop: -380,
            borderRadius: 30,
            overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
            opacity: p,
            transform: `rotateY(${tilt * (1 - 0.3 * p)}deg) rotateX(${tilt * 0.35}deg) translateY(${(1 - p) * 40 + float}px) scale(${0.94 + 0.06 * p})`
          }}
        >
          <OffthreadVideo muted src={staticFile(layer.src)} trimBefore={sec(layer.at)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </AbsoluteFill>
    );
  }

  const size = layer.size ?? 220;
  return (
    <AbsoluteFill style={{ top: `${(layer.y ?? 0.62) * 100}%`, height: 'auto', bottom: 'auto', alignItems: 'center', opacity: p }}>
      <div style={{ display: 'flex', gap: 36, transform: 'translateY(-50%)' }}>
        {layer.icons.map((icon, index) => {
          const q = presence(frame, sec(icon.at), to);
          const bob = Math.sin((frame + index * 11) / 18) * 10;
          return (
            <Img
              key={icon.src}
              src={staticFile(icon.src)}
              style={{ width: size, height: size * 0.73, objectFit: 'cover', borderRadius: 22, boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 34px rgba(120,190,255,0.25)', opacity: q, transform: `translateY(${(1 - q) * 30 + bob}px) scale(${0.92 + 0.08 * q})` }}
            />
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** The continuous backdrop: the gameplay blurred, desaturated and graded navy, with a faint grid. */
export function Backdrop({ src, at, duration }: { src: string; at: number; duration: number }) {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, sec(duration)], [1.15, 1.3]);
  return (
    <AbsoluteFill style={{ background: '#050a18', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo muted src={staticFile(src)} trimBefore={sec(at)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(26px) grayscale(1) brightness(0.55) contrast(1.1)' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#0b2a6b', mixBlendMode: 'color', opacity: 0.9 }} />
      <AbsoluteFill style={{ background: 'rgba(6,14,36,0.35)' }} />
      <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(140,190,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(140,190,255,0.06) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
}

export const FRAME_RATE = FPS;
