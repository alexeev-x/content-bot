import type { GameFind } from '../../modules/game-files';
import type { RubricCaptionResult } from '../../modules/ai';
import type {
  DegradationCode,
  HeroMatchSource,
  RubricFacts,
  RubricHistory,
  RubricContext,
  RubricKey,
  RubricNote,
  RubricSample,
  RubricSources
} from '../../modules/rubrics';
import type { PictureRenderer } from '../../integrations/browser-render/browser-render';
import type { SourcePicture } from '../workflows/picture-quality';

export type Scene = { kind: 'drawn'; base64: string } | { kind: 'failed'; reason: string; detail?: string };

/** The AI writer's caption and the drawn scenes; null when the AI is not wired. */
export type BuildAi = {
  caption: (input: {
    title: string;
    draft: string;
    poll: string | null;
    brief: string;
    reference?: string;
    signal: AbortSignal;
  }) => Promise<RubricCaptionResult>;
  scene: (input: { heading: { text: string; red: string | null } | null }) => Promise<Scene>;
  /** «Анкета», «Забытый герой», «Подозреваемый»: the hero placed into the owner's scene. */
  heroScene: (input: {
    hero: Uint8Array;
    heroName: string;
    scene?: 'anketa' | 'forgotten' | 'suspect';
  }) => Promise<Scene>;
  /** «Гороскоп»: the fortune-teller and the ball's head drawn into the owner's scene. */
  fortuneScene: (input: {
    teller: Uint8Array;
    tellerName: string;
    ball: Uint8Array;
    ballName: string;
  }) => Promise<Scene>;
};

/** What building one rubric post needs; it sends nothing. */
export type BuildDeps = {
  /** The finds in the game's files since a time (the game-files module's read). */
  gameFinds: (since: number) => Promise<GameFind[]>;
  /** STRATZ through the stats bridge; null until both the token and the bridge are set. */
  stratzAccess: { token: string; bridgeUrl?: string } | null;
  /** The bot's own match base «Гайд на героя» counts from. */
  heroMatches: HeroMatchSource | null;
  /** The rubrics' memory between posts (ports.ts): the lab's counters in D1, later the scheduler's history. */
  tellers: RubricSources['tellers'];
  shameHeroes: RubricSources['shameHeroes'];
  turns: RubricSources['turns'];
  renderer: PictureRenderer | null;
  ai: BuildAi | null;
  /** The picture law (workflows/picture-quality.ts): a narrow source picture comes back sharper, else as it was. */
  improvePhoto: (file: SourcePicture) => Promise<SourcePicture>;
  /** Waits before the next browser screenshot (the free plan takes one per 10 seconds). */
  pace: () => Promise<void>;
  /** Logs the build's end: `failed` with the error's code. */
  log: (status: string, errorCode?: string) => void;
  random: () => number;
  now: number;
  /** The scheduler's record of earlier posts; the lab passes none. */
  history?: RubricHistory;
  /** «Кого понерфят?»: the open bet whose result this build is (the scheduler's `bet-result:` slots). */
  bet?: RubricContext['bet'];
  /** «Открытка»: the dated card to build, and where its pictures are (R2). */
  cardId?: string;
  greetingPicture?: (cardId: string) => Promise<Uint8Array | null>;
};

export type BuiltMedia = { kind: 'photo' | 'video' | 'animation'; bytes: Uint8Array };

/** One rubric post ready to send: text, pictures, poll and follow-up, with what it had to give up. */
export type BuiltRubricPost = {
  rubric: RubricKey;
  title: string;
  /** The caption or message: the AI's text (or the draft) with the footer and the links' words. */
  text: string;
  entities: (
    | { type: 'bold'; offset: number; length: number }
    | { type: 'text_link'; offset: number; length: number; url: string }
  )[];
  /** The rich message's HTML (its picture marked by the media slot); null: a plain message or photo. */
  rich: string | null;
  /**
   * The rubric's own rich HTML for a studio post: its picture still the media slot (publishing fills it from the
   * post's media), or without the slot when there is no picture; null: a classic text or photo post.
   */
  richSource: string | null;
  /** An album's rich HTML (the carousel on top); set when `album` is not empty. */
  albumRich: string | null;
  picture: Uint8Array | null;
  album: BuiltMedia[];
  poll: RubricSample['poll'];
  /** The poll is the post: the picture goes inside it, no text post. */
  pollOnly: boolean;
  followUp: {
    afterMinutes: number | null;
    text: string;
    picture: Uint8Array | null;
    guessHero?: { name: string; key: string };
  } | null;
  /** Lines for the owner, in the order they happened. */
  notes: RubricNote[];
  /** Every degradation, the silent ones (a dropped album photo) included. */
  degradations: DegradationCode[];
  facts: RubricFacts;
};
