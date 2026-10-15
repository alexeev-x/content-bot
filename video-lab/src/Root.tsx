import { Composition } from 'remotion';
import { bkb } from './edits/bkb';
import { oracle } from './edits/oracle';
import { EditVideo } from './engine/EditVideo';
import { bkb2 } from './v2/cuts/bkb';
import { oracle2 } from './v2/cuts/oracle';
import { CutVideo } from './v2/CutVideo';
import { bkbFull } from './v3/bkb-full';
import { bkbHook } from './v3/bkb-hook';
import { oracleFull } from './v3/oracle-full';
import { HookVideo } from './v3/HookVideo';
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
      <Composition
        id={bkbFull.id}
        component={HookVideo}
        defaultProps={{ hook: bkbFull }}
        durationInFrames={sec(bkbFull.duration)}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id={oracleFull.id}
        component={HookVideo}
        defaultProps={{ hook: oracleFull }}
        durationInFrames={sec(oracleFull.duration)}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id={bkbHook.id}
        component={HookVideo}
        defaultProps={{ hook: bkbHook }}
        durationInFrames={sec(bkbHook.duration)}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
}
