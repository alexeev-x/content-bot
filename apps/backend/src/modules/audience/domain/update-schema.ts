import { z } from 'zod';

// The few fields of the three update kinds the audience branch reads. Loose objects: Telegram adds fields freely, and a
// field we do not read must never make us drop an update. Strings are bounded so a hostile update costs nothing.

const chatId = z.number().int();
const text = z.string().max(4096);

export const reactionCountUpdateSchema = z.looseObject({
  message_reaction_count: z.looseObject({
    chat: z.looseObject({ id: chatId }),
    message_id: z.number().int().positive(),
    date: z.number().int().nonnegative(),
    reactions: z
      .array(
        z.looseObject({
          type: z.looseObject({
            type: z.string().max(32),
            emoji: z.string().max(16).optional(),
            custom_emoji_id: z.string().max(64).optional()
          }),
          total_count: z.number().int().nonnegative()
        })
      )
      .max(200)
  })
});

export const pollUpdateSchema = z.looseObject({
  poll: z.looseObject({
    id: z.string().min(1).max(64),
    total_voter_count: z.number().int().nonnegative(),
    is_closed: z.boolean(),
    options: z.array(z.looseObject({ text: z.string().max(300), voter_count: z.number().int().nonnegative() })).max(12)
  })
});

const forwardOrigin = z.looseObject({
  type: z.string().max(32),
  chat: z.looseObject({ id: chatId }).optional(),
  date: z.number().int().nonnegative(),
  message_id: z.number().int().positive().optional()
});

const repliedTo = z.looseObject({
  message_id: z.number().int().positive(),
  is_automatic_forward: z.boolean().optional(),
  forward_origin: forwardOrigin.optional()
});

export const groupMessageUpdateSchema = z.looseObject({
  message: z.looseObject({
    message_id: z.number().int().positive(),
    date: z.number().int().nonnegative(),
    chat: z.looseObject({ id: chatId, type: z.enum(['group', 'supergroup']) }),
    from: z
      .looseObject({ id: z.number().int(), is_bot: z.boolean(), username: z.string().max(64).optional() })
      .optional(),
    sender_chat: z.looseObject({ id: chatId }).optional(),
    is_automatic_forward: z.boolean().optional(),
    forward_origin: forwardOrigin.optional(),
    message_thread_id: z.number().int().positive().optional(),
    reply_to_message: repliedTo.optional(),
    text: text.optional(),
    caption: text.optional(),
    photo: z.array(z.unknown()).optional(),
    video: z.unknown().optional(),
    animation: z.unknown().optional(),
    sticker: z.unknown().optional(),
    voice: z.unknown().optional(),
    video_note: z.unknown().optional(),
    document: z.unknown().optional()
  })
});

export type ReactionCountUpdate = z.infer<typeof reactionCountUpdateSchema>['message_reaction_count'];
export type PollUpdate = z.infer<typeof pollUpdateSchema>['poll'];
export type GroupMessage = z.infer<typeof groupMessageUpdateSchema>['message'];
