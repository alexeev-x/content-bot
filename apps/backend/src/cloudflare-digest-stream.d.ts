interface Crypto {
  readonly DigestStream: new (
    algorithm: 'SHA-256'
  ) => WritableStream<Uint8Array> & { readonly digest: Promise<ArrayBuffer> };
}
