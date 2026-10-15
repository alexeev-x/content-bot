import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Backdrop, LayerView } from './Layers';
import { sec } from './look';
import type { Hook } from './types';

export function HookVideo({ hook }: { hook: Hook }) {
  return (
    <AbsoluteFill>
      <Backdrop src={hook.backdrop.src} at={hook.backdrop.at} duration={hook.duration} {...(hook.backdrop.loop === undefined ? {} : { loop: hook.backdrop.loop })} />
      {hook.layers.map((layer, index) => (
        <Sequence key={`${layer.kind}-${layer.from}-${index}`} from={sec(layer.from)} durationInFrames={sec(layer.to) - sec(layer.from)}>
          <LayerView layer={layer} />
        </Sequence>
      ))}
      <Audio src={staticFile(hook.voice)} />
      <Audio src={staticFile(hook.music)} volume={hook.musicGain} />
      {hook.sfx.map((effect) => (
        <Sequence key={`${effect.name}-${effect.at}`} from={sec(effect.at)} durationInFrames={sec(1.2)}>
          <Audio src={staticFile(`sfx/${effect.name}.wav`)} volume={effect.gain} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
