// What a rubric's post had to give up while it was built. The lab prints each note to the owner; the scheduler builds in
// strict mode and fails the candidate on any code its rubric does not allow (RUBRIC_META.allowDegrade), so a post never
// goes out quietly worse than the owner approved.

export const DEGRADATION_CODES = [
  /** The model's scene was not drawn: the post went without its picture. */
  'SCENE_NOT_DRAWN',
  /** A later page of the carousel was not rendered. */
  'SLIDE_NOT_DRAWN',
  /** The second post's picture was not rendered: it goes as text. */
  'FOLLOWUP_PICTURE_NOT_DRAWN',
  /** The AI did not write the caption: the draft went as it is. */
  'TEXT_TEMPLATE',
  /** One of an album's photos was not fetched: the album went with fewer. */
  'ALBUM_PHOTO_MISSING',
  /** «Гайд на героя»: a block of the card has no data and is left out. */
  'GUIDE_BLOCK_MISSING',
  /** «Гайд на героя»: OpenDota or a rougher count stood in for a block. */
  'GUIDE_SOURCE_FALLBACK',
  /** «Гайд на героя»: the bot's own base had too few games, STRATZ's sample stood in. */
  'GUIDE_BASE_TOO_SMALL'
] as const;
export type DegradationCode = (typeof DEGRADATION_CODES)[number];

/** A line for the owner: what was given up (a code), or `INFO` that changes nothing in the post. */
export type RubricNote = { code: DegradationCode | 'INFO'; text: string };

export const infoNote = (text: string): RubricNote => ({ code: 'INFO', text });
