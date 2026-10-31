// What the audience module needs from outside it. The interfaces belong to the consumer (BACKEND_ARCHITECTURE §4).

export interface AudienceChat {
  chatId: number;
  role: 'channel' | 'group';
  /** For a group: the channel it discusses. */
  channelChatId: number | null;
  username: string | null;
  title: string;
  botAdmin: boolean;
  seesAll: boolean;
  checkedAt: number;
}

export interface CommentRow {
  groupChatId: number;
  messageId: number;
  channelChatId: number;
  channelMessageId: number;
  createdAt: number;
  authorKey: string;
  username: string | null;
  kind: 'text' | 'media';
  text: string | null;
}

export interface AudienceRepository {
  /** Upserts the latest count; an older report never overwrites a newer one. Writes nothing for a foreign chat. */
  saveReactions(input: {
    chatId: number;
    messageId: number;
    total: number;
    kindsJson: string;
    reportedAt: number;
  }): Promise<void>;
  /** Updates a registered, still open poll; an unknown id changes nothing. */
  savePollState(input: {
    pollId: string;
    voters: number;
    optionsJson: string;
    closed: boolean;
    now: number;
  }): Promise<void>;
  chat(chatId: number): Promise<AudienceChat | null>;
  thread(
    groupChatId: number,
    rootMessageId: number
  ): Promise<{ channelChatId: number; channelMessageId: number; postAt: number; capped: boolean } | null>;
  saveThread(input: {
    groupChatId: number;
    rootMessageId: number;
    channelChatId: number;
    channelMessageId: number;
    postAt: number;
  }): Promise<void>;
  /** Inserts the comment unless the thread already holds `cap` of them (then the thread is marked capped). */
  saveComment(comment: CommentRow, cap: number): Promise<void>;
  registerPoll(input: {
    pollId: string;
    chatId: number;
    messageId: number;
    publishedAt: number;
    closesAt: number | null;
  }): Promise<void>;
  recordFinalPoll(input: { pollId: string; voters: number; optionsJson: string; now: number }): Promise<void>;
  /** A registered poll's latest counts, or null when it is unknown or nothing came yet. */
  pollState(
    pollId: string
  ): Promise<{ voters: number; options: { text: string; voters: number }[]; closed: boolean } | null>;
  threadComments(input: {
    channelChatId: number;
    channelMessageId: number;
    since: number;
    limit: number;
  }): Promise<CommentRow[]>;
  chats(): Promise<AudienceChat[]>;
  replaceChats(chats: AudienceChat[], keep: number[]): Promise<void>;
  /** Freezes the comment counts of threads at least `minAge` old that have none yet; returns how many. */
  freeze(now: number, minAgeMs: number, limit: number): Promise<number>;
  /** Deletes old comments and threads in bounded statements; returns the rows removed. */
  purge(input: { commentsBefore: number; threadsBefore: number; limit: number }): Promise<number>;
  /** Rows written in the window: what the health check reads instead of counting every update. */
  updatesSince(since: number): Promise<{ reactions: number; polls: number; comments: number; lastAt: number | null }>;
}

/** The channels the bot publishes to: the ones whose audience it listens to. */
export interface AudienceTargets {
  channels(): Promise<{ chatId: string; title: string }[]>;
}

/** Telegram's read calls the setup check makes; answers stay `unknown` and are parsed here. */
export interface AudienceTelegram {
  getChat(chatId: string, signal: AbortSignal): Promise<unknown>;
  getChatMember(chatId: string, userId: number, signal: AbortSignal): Promise<unknown>;
}
