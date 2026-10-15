// An edit is a list of shots on one timeline plus a caption track, all in seconds of the voice-over.
export type Accent = 'white' | 'blue' | 'red' | 'gold' | 'green';

export type CardLine = { at: number; text: string; accent?: Accent; size?: number; font?: 'bold' | 'hand' };

export type Shot =
  | {
      kind: 'clip';
      from: number;
      to: number;
      /** Second of the source video this shot starts at. */
      at: number;
      /** Seconds (on the timeline) where the picture punches in on a strong word. */
      punches?: number[];
      /** Blur strip hiding text burned into the source (fraction of the height, centre). */
      hideBand?: number;
    }
  | { kind: 'card'; from: number; to: number; lines: CardLine[] }
  | {
      kind: 'image';
      from: number;
      to: number;
      src: string;
      /** Height of the picture as a share of the frame. */
      height?: number;
      lines?: CardLine[];
      punches?: number[];
    };

export type Caption = { from: number; to: number; text: string; accent?: Accent; /** Overrides the edit's caption height. */ y?: number };

export type Edit = {
  id: string;
  source: string;
  duration: number;
  shots: Shot[];
  captions: Caption[];
  /** Caption centre as a share of the frame height. */
  captionY: number;
  font: 'bold' | 'hand';
};
