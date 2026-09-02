/**
 * D-Fence — Supabase Storage adapter.
 * Stereotype: <<boundary>>. Traces: 5.1.5, 8.3.6, 10.3.5, 10.4.3.
 */
import { ObjectStorage, StoredObject } from '../../ports/ObjectStorage';

/** 5.1.5: JPEG or PNG, at most 5 MB, at most three per report. */
const PERMITTED_TYPES = ['image/jpeg', 'image/png'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

export class SupabaseStorageGateway implements ObjectStorage {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
  ) {}

  upload(_bucket: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    // Validated here rather than only in the browser: 10.3.6 requires server-side validation of
    // every user-supplied input, and a size limit enforced only by the client is not a limit.
    if (!PERMITTED_TYPES.includes(contentType as (typeof PERMITTED_TYPES)[number])) {
      throw new Error(`unsupported image type ${contentType}; JPEG or PNG only (5.1.5)`);
    }
    if (data.byteLength > MAX_BYTES) {
      throw new Error(`image is ${data.byteLength} bytes; the limit is 5 MB (5.1.5)`);
    }
    // TODO(F11): storage.from(bucket).upload() with a random key — never the filename, which would
    // leak the reporter's device naming and make URLs guessable (10.3.5).
    throw new Error('not implemented');
  }

  signedUrl(_bucket: string, _key: string, _ttlSeconds: number): Promise<string> {
    // TODO(F11): createSignedUrl. Buckets stay private; there is no public read path (10.3.5).
    throw new Error('not implemented');
  }

  remove(_bucket: string, _key: string): Promise<void> {
    throw new Error('not implemented');
  }
}
