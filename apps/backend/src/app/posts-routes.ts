import {
  approvePostInputSchema,
  createPostInputSchema,
  listPostsQuerySchema,
  updatePostInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { approvePost, createPost, getPost, listPosts, updatePost } from '../modules/content';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

// Worst case a 4096-character body is six bytes per character once JSON-escaped.
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
    validated('json', createPostInputSchema),
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
    return c.json(await listPosts({ repo: c.get('container').posts }, c.req.valid('query')));
  })
  .get('/:id', validated('param', idParamSchema), async (c) => {
    const id = postId(c.req.valid('param').id);
    return c.json(await getPost({ repo: c.get('container').posts }, id));
  })
  .patch(
    '/:id',
    limitBody(MAX_BODY_BYTES),
    validated('param', idParamSchema),
    validated('json', updatePostInputSchema),
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
  );
