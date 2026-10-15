import { Composition } from 'remotion';
import { bkb } from './edits/bkb';
import { oracle } from './edits/oracle';
import { EditVideo } from './engine/EditVideo';
import { bkb2 } from './v2/cuts/bkb';
import { oracle2 } from './v2/cuts/oracle';
import { CutVideo } from './v2/CutVideo';
import { FPS, sec } from './engine/style';

export function Root() {
  return (
    <>
      {[bkb, oracle].map((edit) => (
        <Composition
          key={edit.id}
          id={edit.id}
          component={EditVideo}
          defaultProps={{ edit }}
          durationInFrames={sec(edit.duration)}
          fps={FPS}
          width={1080}
          height={1920}
        />
      ))}
      {[bkb2, oracle2].map((cut) => (
        <Composition
          key={cut.id}
          id={cut.id}
          component={CutVideo}
          defaultProps={{ cut }}
          durationInFrames={sec(cut.duration)}
          fps={FPS}
          width={1080}
          height={1920}
        />
      ))}
    </>
  );
}
