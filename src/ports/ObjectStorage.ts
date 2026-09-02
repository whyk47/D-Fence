/**
 * D-Fence — the object storage port.
 * Layer: ports. Traces: 5.1.5 (report photographs), 8.3.6 (completion evidence), 10.3.5.
 *
 * Photographs are not stored in the database — they are held in object storage and referenced by
 * row. 10.3.5 requires them to be served only through authenticated, non-enumerable URLs, which is
 * why this interface has no "public URL" method: every read goes through signedUrl(), whose result
 * expires.
 */
export interface StoredObject {
  /** Opaque and non-guessable. Never derived from the report id or the filename (10.3.5). */
  key: string;
  contentType: string;
  sizeBytes: number;
}

export interface ObjectStorage {
  /**
   * @param bucket 'report-photos' or 'completion-evidence'
   * @throws when the type is not JPEG or PNG, or the size exceeds the 5 MB cap (5.1.5)
   */
  upload(bucket: string, data: Uint8Array, contentType: string): Promise<StoredObject>;

  /** 10.3.5. A short-lived URL for one object, for one authorised reader. */
  signedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string>;

  /** 10.4.3. Used when a user's personal data is deleted. */
  remove(bucket: string, key: string): Promise<void>;
}
