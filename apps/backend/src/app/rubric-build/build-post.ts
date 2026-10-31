import { expandRichMedia, RICH_MEDIA_SLOT } from '@alexeev/contracts';
import {
  buildRubricSample,
  type DegradationCode,
  RUBRIC_BRIEFS,
  RUBRIC_META,
  RUBRIC_TITLES,
  rubricRichHtml,
  type RubricKey,
  type RubricNote,
  type RubricSample,
  titlePicture
} from '../../modules/rubrics';
import { describeError, errorParts } from '../../platform/error-detail';
import { AppError } from '../../shared/app-error';
import { albumRichHtml, withLinks } from './payload';
import { fetchAlbum, fetchPhoto } from './photos';
import { pageWithScene } from './scene';
import { rubricSources, sourceError } from './sources';
import type { BuildDeps, BuiltRubricPost } from './types';

// One rubric post from live data, the way production would post it (owner, 25.10.2026: «как будто продовская, через
// ИИ»): the AI writer's caption and a picture — the model's scene and title under the browser's exact portraits, icons
// and numbers. It sends nothing: the lab sends it to the owner's chat, the scheduler to the channel.

const CAPTION_TIMEOUT_MS = 120_000;

/**
 * Builds the post. `strict` (the scheduler) fails on any degradation the rubric does not allow, so a post never goes
 * out quietly worse than the owner approved; the lab builds non-strict and shows the notes.
 */
export async function buildRubricPost(
  deps: BuildDeps,
  rubric: RubricKey,
  options: { strict: boolean }
): Promise<BuiltRubricPost> {
  let sample;
  try {
    sample = await buildRubricSample(rubric, {
      sources: {
        ...rubricSources(deps.gameFinds, deps.stratzAccess),
        heroMatches: deps.heroMatches,
        tellers: deps.tellers,
        shameHeroes: deps.shameHeroes,
        turns: deps.turns,
        ...(deps.greetingPicture === undefined ? {} : { greetingPicture: deps.greetingPicture })
      },
      random: deps.random,
      now: deps.now,
      ...(deps.history === undefined ? {} : { history: deps.history }),
      ...(deps.bet === undefined ? {} : { bet: deps.bet }),
      ...(deps.cardId === undefined ? {} : { cardId: deps.cardId })
    });
  } catch (error) {
    const source = sourceError(error);
    if (source !== null) {
      deps.log('failed', source.code);
      // The source's HTTP status tells a wrong key (401) from a refused address (403); its own words say why.
      throw new AppError('UNAVAILABLE', 'A data source did not answer', {
        reason: describeError(error),
        ...(source.status === null ? {} : { status: String(source.status) })
      });
    }
    if (error instanceof AppError) deps.log('failed', error.details?.['reason'] ?? error.code);
    throw error;
  }
  return postFromSample(deps, rubric, sample, options);
}

/** The post around a rubric's sample: caption, pictures, follow-up and the strict check. */
export async function postFromSample(
  deps: BuildDeps,
  rubric: RubricKey,
  sample: RubricSample,
  options: { strict: boolean }
): Promise<BuiltRubricPost> {
  const title = RUBRIC_TITLES[rubric];
  const poll = sample.poll === null ? null : `${sample.poll.question} — ${sample.poll.options.join(' / ')}`;
  // The caption is written while the scene is drawn.
  // A rubric that is one poll with its picture has no text to write.
  const pollOnly = sample.pictureInPoll === true && sample.poll !== null;
  // Fixed captions (a riddle and its answer) are final as written: no AI either.
  const noWriter = pollOnly || sample.ownText === true;
  const caption =
    deps.ai === null || noWriter
      ? Promise.resolve(null)
      : deps.ai.caption({
          title,
          draft: sample.text,
          poll,
          brief: RUBRIC_BRIEFS[rubric],
          ...(sample.reference === undefined ? {} : { reference: sample.reference }),
          signal: AbortSignal.timeout(CAPTION_TIMEOUT_MS)
        });

  const notes: RubricNote[] = [...(sample.notes ?? [])];
  const silent: DegradationCode[] = [];
  let picture: Uint8Array | null = null;
  // Every rubric gets a picture for now (owner, 25.10.2026: «пусть ИИ рисует для всех, а там уже отбросим»): one with
  // no layout of its own is the drawn scene with its title alone, and none at all when the scene is not drawn.
  // A rubric that decided against a picture (owner, 28.10.2026: text jokes and bare polls) gets no scene either.
  const ownPhotos = sample.photo !== undefined || sample.album !== undefined || sample.pictureBytes !== undefined;
  const page =
    ownPhotos || sample.noPicture === true ? null : (sample.picture ?? (deps.ai === null ? null : titlePicture(title)));
  if (page !== null) {
    if (deps.renderer === null) {
      throw new AppError('UNAVAILABLE', 'Browser Rendering is not bound here', { reason: 'BROWSER_NOT_BOUND' });
    }
    const html = await pageWithScene(deps.ai, sample, page, notes);
    if (html !== null)
      try {
        picture = await deps.renderer.render(html, page, 'png');
      } catch (error) {
        deps.log('failed', errorParts(error).code);
        throw new AppError('UNAVAILABLE', 'The picture was not rendered', {
          reason: describeError(error, 'screenshot')
        });
      }
  }
  if (sample.pictureBytes !== undefined) picture = sample.pictureBytes;
  if (sample.photo !== undefined) {
    const file = await deps.improvePhoto({
      bytes: await fetchPhoto(sample.photo.url),
      contentType: 'image/png',
      fileName: `${rubric}.png`
    });
    picture = file.bytes;
  }
  const { media: album, missing } = await fetchAlbum(deps, rubric, sample.album);
  if (missing > 0) silent.push('ALBUM_PHOTO_MISSING');
  // More pages of the post (the guide's «Чем отличается») follow the picture as one carousel.
  if (picture !== null && deps.renderer !== null && (sample.slides?.length ?? 0) > 0) {
    const pages: Uint8Array[] = [picture];
    for (const slide of sample.slides ?? []) {
      await deps.pace();
      try {
        pages.push(await deps.renderer.render(slide.html, slide, 'png'));
      } catch (error) {
        notes.push({ code: 'SLIDE_NOT_DRAWN', text: `Слайд не нарисован (${describeError(error, 'screenshot')}).` });
      }
    }
    if (pages.length > 1) {
      album.push(...pages.map((bytes) => ({ kind: 'photo' as const, bytes })));
      picture = null;
    }
  }
  if (sample.album !== undefined && album.length === 0) {
    throw new AppError('UNAVAILABLE', 'No photo of the album was fetched', { reason: 'PHOTO_FETCH' });
  }
  const written = await caption.catch(() => null);
  if (deps.ai !== null && !noWriter && written?.ok !== true)
    notes.push({ code: 'TEXT_TEMPLATE', text: 'Текст — шаблон: ИИ его не написал.' });
  // The footer stays word for word under the AI's text; links show as their words (text_link entities).
  const body = [
    written?.ok === true ? written.text : sample.text,
    ...(sample.footer === undefined ? [] : [sample.footer])
  ].join('\n\n');
  const linked = withLinks(body, sample.links ?? []);
  const text = linked.text;
  // A bold first line (a setup or a heading) as an entity: the text is sent plain.
  const lead = sample.boldLead === true ? (text.split('\n')[0] ?? '').length : 0;
  const entities = [...(lead > 0 ? [{ type: 'bold' as const, offset: 0, length: lead }] : []), ...linked.entities];

  // The second post (a riddle's answer) is drawn now too.
  let followUpPicture: Uint8Array | null = null;
  const followUp = sample.followUp;
  if (followUp?.picture && deps.renderer !== null) {
    await deps.pace();
    try {
      followUpPicture = await deps.renderer.render(followUp.picture.html, followUp.picture, 'png');
    } catch (error) {
      notes.push({
        code: 'FOLLOWUP_PICTURE_NOT_DRAWN',
        text: `Картинка второго поста не нарисована (${describeError(error, 'screenshot')}).`
      });
    }
  }

  const degradations = [...notes.flatMap((note) => (note.code === 'INFO' ? [] : [note.code])), ...silent];
  if (options.strict) {
    const allowed = new Set<DegradationCode>(RUBRIC_META[rubric].allowDegrade);
    const refused = degradations.find((code) => !allowed.has(code));
    if (refused !== undefined) {
      deps.log('failed', `DEGRADED:${refused}`);
      throw new AppError('UNAVAILABLE', 'The post came out worse than approved', { reason: `DEGRADED:${refused}` });
    }
  }

  // A rubric's own rich HTML marks where its picture goes; without a drawn picture that mark is dropped.
  const ownRich =
    sample.rich === undefined
      ? null
      : picture === null
        ? sample.rich.replace(RICH_MEDIA_SLOT, '')
        : expandRichMedia(sample.rich, [{ kind: 'photo' }]);
  return {
    rubric,
    title,
    text,
    entities,
    rich: pollOnly || album.length > 0 ? null : (ownRich ?? rubricRichHtml(text, picture !== null)),
    richSource:
      pollOnly || album.length > 0 || sample.rich === undefined
        ? null
        : picture === null
          ? sample.rich.replace(RICH_MEDIA_SLOT, '')
          : sample.rich,
    albumRich: album.length > 0 ? albumRichHtml(body, sample.links ?? [], album) : null,
    picture,
    album,
    poll: sample.poll,
    pollOnly,
    followUp:
      followUp === undefined
        ? null
        : {
            afterMinutes: followUp.afterMinutes,
            text: followUp.text,
            picture: followUpPicture,
            ...(followUp.guessHero === undefined ? {} : { guessHero: followUp.guessHero })
          },
    notes,
    degradations: [...new Set(degradations)],
    facts: sample.facts ?? {}
  };
}
