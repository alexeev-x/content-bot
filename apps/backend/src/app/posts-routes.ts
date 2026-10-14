import {
  attachPostMediaInputSchema,
  approvePostInputSchema,
  bulkDeletePostsInputSchema,
  bulkRestorePostsInputSchema,
  changePostMediaRevisionInputSchema,
  cropPostMediaQuerySchema,
  createPostInputSchema,
  deletePostInputSchema,
  listPostsQuerySchema,
  POST_ENTITY_ISSUE_CODES,
  restorePostInputSchema,
  returnPostToDraftInputSchema,
  reorderPostMediaInputSchema,
  uploadPostMediaQuerySchema,
  updatePostInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  attachRetainedPostMedia,
  cropPostMedia,
  approvePost,
  createPost,
  getPost,
  removePostMedia,
  reorderPostMedia,
  updatePost,
  uploadPostMedia
} from '../modules/content';
import { deletePost, deletePosts, restorePosts } from '../modules/lifecycle';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';
import { restoreAndReadPost } from './workflows/restore-post';
import { returnPostToDraftAndRead } from './workflows/return-post-to-draft';
import { listPostsFromApp } from './posts-list-query';

// Worst valid post request: 12 288 body bytes (4096 characters of three-byte UTF-8), 600 title bytes and up to
// 16 384 bytes of entities (POST_ENTITIES_JSON_MAX, ASCII only) plus keys: about 29.4 KB, so 32 KB is enough.
const MAX_BODY_BYTES = 32 * 1024;

const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().min(1).max(255) });
const idParamSchema = z.object({ id: z.string() });
const cropParamSchema = z.strictObject({ id: z.string(), mediaId: z.uuid() });

// A malformed id cannot name a post, so it is the same 404 as an unknown one (no query is made).
function postId(raw: string): string {
  if (!z.uuid().safeParse(raw).success) throw new AppError('NOT_FOUND', 'Post not found');
  return raw;
}

// Handlers only parse, call one use case and return its DTO.
export const postsRoutes = new Hono<AppBindings>()
  .post(
    '/',
    limitBody(MAX_BODY_BYTES),
    validated('header', idempotencyHeaderSchema),
    validated('json', createPostInputSchema, { reasons: POST_ENTITY_ISSUE_CODES }),
    async (c) => {
      const container = c.get('container');
      const post = await createPost(
        {
          repo: container.posts,
          idempotency: container.idempotency,
          now: container.clock.now(),
          newId: container.newId
        },
        {
          actor: c.get('actor').telegramId,
          idempotencyKey: c.req.valid('header')['idempotency-key'],
          input: c.req.valid('json')
        }
      );
      return c.json(post, 201);
    }
  )
  .get('/', validated('query', listPostsQuerySchema), async (c) => {
    const container = c.get('container');
    if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return c.json(
      await listPostsFromApp({ container, db: c.env.DB, now: container.clock.now() }, c.req.valid('query'))
    );
  })
  .post(
    '/delete',
    limitBody(MAX_BODY_BYTES),
    validated('json', bulkDeletePostsInputSchema, { reasons: ['DUPLICATE_IDS'] }),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await deletePosts(
          { repo: container.lifecycle, now: container.clock.now() },
          { actor: c.get('actor').telegramId, items: c.req.valid('json').items }
        )
      );
    }
  )
  .post(
    '/restore',
    limitBody(MAX_BODY_BYTES),
    validated('json', bulkRestorePostsInputSchema, { reasons: ['DUPLICATE_IDS'] }),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await restorePosts(
          { repo: container.lifecycle, now: container.clock.now() },
          { actor: c.get('actor').telegramId, items: c.req.valid('json').items }
        )
      );
    }
  )
  .get('/:id', validated('param', idParamSchema), async (c) => {
    const container = c.get('container');
    const id = postId(c.req.valid('param').id);
    return c.json(
      await getPost({ repo: container.posts, summaries: container.postSummaries, now: container.clock.now() }, id)
    );
  })
  .post(
    '/:id/media/attach',
    validated('param', idParamSchema),
    limitBody(MAX_BODY_BYTES),
    validated('json', attachPostMediaInputSchema),
    async (c) => {
      const container = c.get('container');
      const result = await attachRetainedPostMedia(
        {
          repo: container.postMedia,
          storage: container.mediaStorage,
          now: container.clock.now(),
          newId: container.newId
        },
        {
          postId: postId(c.req.valid('param').id),
          actor: c.get('actor').telegramId,
          ...c.req.valid('json')
        }
      );
      return c.json(result);
    }
  )
  .post(
    '/:id/media',
    validated('param', idParamSchema),
    validated('query', uploadPostMediaQuerySchema),
    validated('header', idempotencyHeaderSchema),
    async (c) => {
      const container = c.get('container');
      const body = c.req.raw.body;
      if (body === null) throw new AppError('VALIDATION_ERROR', 'A media file is required', { reason: 'EMPTY_MEDIA' });
      if (container.mediaStorage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
      const result = await uploadPostMedia(
        {
          repo: container.postMedia,
          storage: container.mediaStorage,
          now: container.clock.now(),
          newId: container.newId
        },
        {
          postId: postId(c.req.valid('param').id),
          revision: c.req.valid('query').revision,
          fileName: c.req.valid('query').fileName,
          contentType: c.req.header('content-type') ?? '',
          contentLength: Number(c.req.header('content-length')),
          body,
          actor: c.get('actor').telegramId,
          idempotencyKey: c.req.valid('header')['idempotency-key']
        }
      );
      return c.json(result, 201);
    }
  )
  .post(
    '/:id/media/:mediaId/crop',
    validated('param', cropParamSchema),
    validated('query', cropPostMediaQuerySchema),
    validated('header', idempotencyHeaderSchema),
    async (c) => {
      const container = c.get('container');
      const body = c.req.raw.body;
      if (body === null)
        throw new AppError('VALIDATION_ERROR', 'A cropped photo is required', { reason: 'EMPTY_MEDIA' });
      if (container.mediaStorage === undefined) throw new AppError('UNAVAILABLE', 'Media storage is not configured');
      return c.json(
        await cropPostMedia(
          {
            repo: container.postMedia,
            storage: container.mediaStorage,
            now: container.clock.now(),
            newId: container.newId
          },
          {
            postId: postId(c.req.valid('param').id),
            mediaId: c.req.valid('param').mediaId,
            revision: c.req.valid('query').revision,
            fileName: c.req.valid('query').fileName,
            contentType: c.req.header('content-type') ?? '',
            contentLength: Number(c.req.header('content-length')),
            body,
            actor: c.get('actor').telegramId,
            idempotencyKey: c.req.valid('header')['idempotency-key']
          }
        )
      );
    }
  )
  .delete(
    '/:id/media/:mediaId',
    validated('param', z.object({ id: z.string(), mediaId: z.string() })),
    limitBody(MAX_BODY_BYTES),
    validated('json', changePostMediaRevisionInputSchema),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await removePostMedia(
          { repo: container.postMedia, now: container.clock.now() },
          {
            postId: postId(c.req.valid('param').id),
            mediaId: c.req.valid('param').mediaId,
            revision: c.req.valid('json').revision,
            actor: c.get('actor').telegramId
          }
        )
      );
    }
  )
  .patch(
    '/:id/media/order',
    validated('param', idParamSchema),
    limitBody(MAX_BODY_BYTES),
    validated('json', reorderPostMediaInputSchema),
    async (c) => {
      const container = c.get('container');
      return c.json(
        await reorderPostMedia(
          { repo: container.postMedia, now: container.clock.now() },
          { postId: postId(c.req.valid('param').id), actor: c.get('actor').telegramId, ...c.req.valid('json') }
        )
      );
    }
  )
  .patch(
    '/:id',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', updatePostInputSchema, { reasons: POST_ENTITY_ISSUE_CODES }),
    async (c) => {
      const container = c.get('container');
      const post = await updatePost(
        { repo: container.posts, now: container.clock.now() },
        { actor: c.get('actor').telegramId, id: postId(c.req.valid('param').id), input: c.req.valid('json') }
      );
      return c.json(post);
    }
  )
  .post(
    '/:id/approve',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', approvePostInputSchema),
    async (c) => {
      const container = c.get('container');
      const post = await approvePost(
        { repo: container.posts, now: container.clock.now() },
        { actor: c.get('actor').telegramId, id: postId(c.req.valid('param').id), input: c.req.valid('json') }
      );
      return c.json(post);
    }
  )
  .post(
    '/:id/delete',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', deletePostInputSchema),
    async (c) => {
      const container = c.get('container');
      const result = await deletePost(
        { repo: container.lifecycle, now: container.clock.now() },
        {
          actor: c.get('actor').telegramId,
          id: postId(c.req.valid('param').id),
          revision: c.req.valid('json').revision
        }
      );
      return c.json(result);
    }
  )
  .post(
    '/:id/restore',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', restorePostInputSchema),
    async (c) => {
      const container = c.get('container');
      const post = await restoreAndReadPost(
        {
          lifecycle: container.lifecycle,
          posts: container.posts,
          summaries: container.postSummaries,
          now: container.clock.now()
        },
        {
          actor: c.get('actor').telegramId,
          id: postId(c.req.valid('param').id),
          revision: c.req.valid('json').revision
        }
      );
      return c.json(post);
    }
  )
  .post(
    '/:id/draft',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', returnPostToDraftInputSchema),
    async (c) => {
      const container = c.get('container');
      const post = await returnPostToDraftAndRead(
        {
          lifecycle: container.lifecycle,
          posts: container.posts,
          summaries: container.postSummaries,
          now: container.clock.now()
        },
        {
          actor: c.get('actor').telegramId,
          id: postId(c.req.valid('param').id),
          revision: c.req.valid('json').revision
        }
      );
      return c.json(post);
    }
  );
