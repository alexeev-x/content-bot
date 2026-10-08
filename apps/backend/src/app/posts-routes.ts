import {
  approvePostInputSchema,
  bulkDeletePostsInputSchema,
  bulkRestorePostsInputSchema,
  createPostInputSchema,
  deletePostInputSchema,
  listPostsQuerySchema,
  POST_ENTITY_ISSUE_CODES,
  restorePostInputSchema,
  updatePostInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { approvePost, createPost, getPost, listPosts, updatePost } from '../modules/content';
import { deletePost, deletePosts, restorePosts } from '../modules/lifecycle';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';
import { restoreAndReadPost } from './workflows/restore-post';

// Worst valid post request: 12 288 body bytes (4096 characters of three-byte UTF-8), 600 title bytes and up to
// 16 384 bytes of entities (POST_ENTITIES_JSON_MAX, ASCII only) plus keys: about 29.4 KB, so 32 KB is enough.
const MAX_BODY_BYTES = 32 * 1024;

const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().min(1).max(255) });
const idParamSchema = z.object({ id: z.string() });

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
    return c.json(
      await listPosts(
        { repo: container.posts, summaries: container.postSummaries, now: container.clock.now() },
        c.req.valid('query')
      )
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
  );
