import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { Captions } from './Captions';
import { ShotView } from './Shots';
import { sec } from './style';
import type { Edit } from './types';

/** The whole video: the original voice-over and music, the shots on top, then the captions. */
export function EditVideo({ edit }: { edit: Edit }) {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Audio src={staticFile(edit.source)} />
      {edit.shots.map((shot) => (
        <Sequence key={`${shot.kind}-${shot.from}`} from={sec(shot.from)} durationInFrames={sec(shot.to) - sec(shot.from)}>
          <ShotView shot={shot} source={edit.source} />
        </Sequence>
      ))}
      <Captions captions={edit.captions} y={edit.captionY} font={edit.font} />
    </AbsoluteFill>
  );
}
