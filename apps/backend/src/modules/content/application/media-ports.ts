import type { MediaDetach, MediaLibraryItemDto, MediaUsageDto, PostMediaDto } from '@alexeev/contracts';

export interface MediaAssetInput extends Omit<PostMediaDto, 'position'> {
  objectKey: string;
  sha256: string;
  createdAt: number;
}

export type StoredCrop =
  | { state: 'in_flight'; requestId: string; leaseUntil: number }
  | { state: 'completed'; payloadHash: string; responseBody: string; mediaId: string };

export interface StoredUpload {
  payloadHash: string;
  responseBody: string;
}

export interface MediaPostState {
  revision: number;
  status: 'draft' | 'approved';
  kind: 'text' | 'poll';
  /** A rich post names its media by position: removing or reordering them would send other pictures. */
  rich: boolean;
  media: PostMediaDto[];
}

export interface PostMediaRepository {
  registerStaging(mediaId: string, objectKey: string, now: number): Promise<void>;
  removeStaging(mediaId: string): Promise<void>;
  /** Reserves several staging keys in one statement, so copying N files costs one D1 query. */
  registerStagingMany(items: { mediaId: string; objectKey: string }[], now: number): Promise<void>;
  findObjectKeys(mediaIds: string[]): Promise<Map<string, string>>;
  findUpload(postId: string, idempotencyKey: string): Promise<StoredUpload | null>;
  findCrop(postId: string, idempotencyKey: string): Promise<StoredCrop | null>;
  claimCrop(
    postId: string,
    idempotencyKey: string,
    requestId: string,
    now: number
  ): Promise<'claimed' | 'in_flight' | 'completed'>;
  releaseCrop(postId: string, idempotencyKey: string, requestId: string): Promise<void>;
  findPostState(postId: string): Promise<MediaPostState | null>;
  listLibrary(input: {
    kind: 'all' | 'photo' | 'video';
    search?: string;
    usage: 'all' | 'used' | 'unused';
    after?: { createdAt: number; id: string };
    offset?: number;
    limit: number;
  }): Promise<{ items: MediaLibraryItemDto[]; totalCount: number }>;
  findRetainedMedia(mediaIds: string[]): Promise<PostMediaDto[]>;
  findLibraryItem(mediaId: string): Promise<MediaLibraryItemDto | null>;
  findDerivation(idempotencyKey: string): Promise<StoredUpload | null>;
  /** Commits a library-only derivative atomically; false means the claim or the staging row was lost. */
  storeDerived(input: {
    idempotencyKey: string;
    sourceMediaId: string;
    payloadHash: string;
    responseBody: string;
    actor: string;
    now: number;
    asset: MediaAssetInput & { sourceMediaId: string };
    /** mode=replace: swap the source for the asset in draft posts and drop the source from the listing, same batch. */
    replace?: boolean;
  }): Promise<boolean>;
  /**
   * Commits a standalone library upload atomically (claim in media_derivations, whose source_media_id is the
   * new asset itself); false means the claim or the staging row was lost.
   */
  storeLibraryUpload(input: {
    idempotencyKey: string;
    payloadHash: string;
    responseBody: string;
    actor: string;
    now: number;
    asset: MediaAssetInput;
  }): Promise<boolean>;
  /** A retained library item that was not replaced before. */
  findReplaceableSource(mediaId: string): Promise<boolean>;
  /** Idempotent; false when the item is unknown, not retained or replaced. */
  getUsage(mediaId: string): Promise<MediaUsageDto | null>;
  attachRetained(input: {
    postId: string;
    expectedRevision: number;
    actor: string;
    now: number;
    currentIds: string[];
    /** Final ids in attach order; a copy's own new id stands in for the picture it duplicates. */
    mediaIds: string[];
    /** The same picture attached again: a new asset row with its own R2 object, so every row owns one object. */
    copies: { id: string; sourceId: string; objectKey: string }[];
  }): Promise<boolean>;
  attach(input: {
    postId: string;
    expectedRevision: number;
    actor: string;
    now: number;
    idempotencyKey: string;
    payloadHash: string;
    asset: MediaAssetInput;
    responseBody: string;
    /** Kept out of the library and deleted with its post (attached_by_bot): a file the bot attached itself. */
    hidden?: boolean;
  }): Promise<boolean>;
  replaceWithCrop(input: {
    postId: string;
    expectedRevision: number;
    actor: string;
    now: number;
    sourceMediaId: string;
    position: number;
    requestId: string;
    idempotencyKey: string;
    payloadHash: string;
    responseBody: string;
    asset: MediaAssetInput & { sourceMediaId: string };
  }): Promise<boolean>;
  rewrite(input: {
    postId: string;
    expectedRevision: number;
    actor: string;
    now: number;
    mediaIds: string[];
  }): Promise<boolean>;
  findObjectKey(mediaId: string): Promise<string | null>;
  deleteUnusedAssets(input: { mediaIds: string[]; actor: string; now: number; detach?: MediaDetach }): Promise<{
    deleted: { mediaId: string; objectKey: string }[];
    inUse: string[];
    notFound: string[];
  }>;
  finishDeletedAssets(mediaIds: string[]): Promise<void>;
  claimCleanup(limit: number, now: number): Promise<{ mediaId: string; objectKey: string }[]>;
  stagingIsActive(mediaId: string): Promise<boolean>;
  cleanupIsReferenced(mediaId: string): Promise<boolean>;
  completeCleanup(mediaId: string): Promise<void>;
  failCleanup(mediaId: string): Promise<void>;
}

export interface StoredMediaObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  contentType?: string;
}

export interface MediaObjectStorage {
  put(objectKey: string, body: ReadableStream<Uint8Array>, contentType: string): Promise<void>;
  get(objectKey: string): Promise<StoredMediaObject | null>;
  delete(objectKey: string | string[]): Promise<void>;
}
