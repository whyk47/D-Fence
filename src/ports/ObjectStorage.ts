/**
 * D-Fence — the object storage port.
 * Layer: ports. Traces: 5.1.5 (report photographs), 8.3.6 (completion evidence), 10.3.5.
 *
 * Photographs are not stored in the database — they are held in object storage and referenced by
 * row. 10.3.5 requires them to be served only through authenticated, non-enumerable URLs, which is
 * why this interface has no "public URL" method: every read goes through signedUrl(), whose result
 * expires.
 */
/**
 * The two buckets, named once so a typo cannot create a third by accident.
 *
 * They live in the port rather than in the Supabase adapter because control classes need to name a
 * bucket, and importing them from the gateway dragged `node:crypto` into the browser bundle
 * through one shared constant — a build failure that says something true about layering: a control
 * class may not depend on an adapter.
 */
export const REPORT_PHOTOS = 'report-photos';
export const COMPLETION_EVIDENCE = 'completion-evidence';

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

  /**
   * 8.3.7, 10.3.6 — does this key name an object that is really here?
   *
   * The method 8.3.7 actually rests on. "A completion shall carry photographic evidence" is not
   * met by a completion carrying a *string*, and without this the two are indistinguishable to the
   * server: `photoKeys: ["not-a-real-file-at-all"]` closed a work order and the acceptance harness
   * reported the requirement as passing.
   *
   * Returns false rather than throwing for an unknown key, so a caller can count how many of a
   * batch were bad and say so in one sentence.
   */
  exists(bucket: string, key: string): Promise<boolean>;

  /** 10.3.5. A short-lived URL for one object, for one authorised reader. */
  signedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string>;

  /** 10.4.3. Used when a user's personal data is deleted. */
  remove(bucket: string, key: string): Promise<void>;
}
