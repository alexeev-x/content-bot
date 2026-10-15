import { Composition } from 'remotion';
import { bkb } from './edits/bkb';
import { oracle } from './edits/oracle';
import { EditVideo } from './engine/EditVideo';
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
    </>
  );
}
