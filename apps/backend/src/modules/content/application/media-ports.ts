import type { PostMediaDto } from '@alexeev/contracts';

export interface MediaAssetInput extends Omit<PostMediaDto, 'position'> {
  objectKey: string;
  sha256: string;
  createdAt: number;
}

export interface StoredUpload {
  payloadHash: string;
  responseBody: string;
}

export interface MediaPostState {
  revision: number;
  status: 'draft' | 'approved';
  media: PostMediaDto[];
}

export interface PostMediaRepository {
  registerStaging(mediaId: string, objectKey: string, now: number): Promise<void>;
  removeStaging(mediaId: string): Promise<void>;
  findUpload(postId: string, idempotencyKey: string): Promise<StoredUpload | null>;
  findPostState(postId: string): Promise<MediaPostState | null>;
  attach(input: {
    postId: string;
    expectedRevision: number;
    actor: string;
    now: number;
    idempotencyKey: string;
    payloadHash: string;
    asset: MediaAssetInput;
    responseBody: string;
  }): Promise<boolean>;
  rewrite(input: {
    postId: string;
    expectedRevision: number;
    actor: string;
    now: number;
    mediaIds: string[];
  }): Promise<boolean>;
  findObjectKey(mediaId: string): Promise<string | null>;
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
  delete(objectKey: string): Promise<void>;
}
