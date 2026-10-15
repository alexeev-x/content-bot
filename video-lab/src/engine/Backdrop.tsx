import { AbsoluteFill } from 'remotion';

/** The dark grid card the references use behind text and renders. */
export function Backdrop() {
  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(ellipse at 50% 45%, #1c1410 0%, #0b0908 70%), #0b0908',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px), radial-gradient(ellipse at 50% 45%, #1d1511 0%, #0a0807 72%)',
        backgroundSize: '72px 72px, 72px 72px, 100% 100%'
      }}
    />
  );
}
