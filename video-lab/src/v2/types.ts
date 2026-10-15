// v2: a voice-over is cut into beats that change every 1.5–3 s; captions are built from word timings.
export type Word = { s: number; e: number; w: string };
export type Tone = 'white' | 'yellow' | 'red' | 'green' | 'blue' | 'gold';
export type Line = { at: number; text: string; tone?: Tone; size?: number };

export type Beat =
  | { kind: 'hero'; from: number; to: number; hero: string; loop: number; tint: string; lines?: Line[]; scale?: number }
  | { kind: 'icons'; from: number; to: number; tint: string; icons: { src: string; at: number; label?: string }[]; lines?: Line[] }
  | { kind: 'clip'; from: number; to: number; src: string; at: number; tint: string }
  | { kind: 'slam'; from: number; to: number; tint: string; lines: Line[] }
  | {
      kind: 'versus';
      from: number;
      to: number;
      rows: { at: number; cause: string; verdict: string; tone: Tone }[];
    }
  | { kind: 'poll'; from: number; to: number; title: string; heroes: { src: string; name: string }[] };

export type Sfx = { at: number; name: 'whoosh' | 'pop' | 'impact' | 'cash' | 'riser'; gain?: number };

export type Cut = {
  id: string;
  duration: number;
  voice: string;
  music: string;
  musicGain: number;
  words: Word[];
  /** Spoken-word fixes for captions: lowercase recognised word → caption text. */
  fixes: Record<string, string>;
  /** Caption words drawn in a colour (lowercase, without punctuation). */
  accents: Record<string, Tone>;
  beats: Beat[];
  /** Strong moments: camera shake, a white flash and an impact. */
  hits: number[];
  sfx: Sfx[];
};
