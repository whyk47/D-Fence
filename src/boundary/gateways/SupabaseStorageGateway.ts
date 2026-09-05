/**
 * D-Fence — Supabase Storage adapter.
 * Stereotype: <<boundary>>. Traces: 5.1.5, 8.3.6, 8.3.7, 10.3.5, 10.3.6, 10.4.3.
 *
 * This class existed with its three methods throwing `not implemented`, and it was instantiated
 * nowhere. The consequence was not that photographs failed to upload — it was worse than that.
 * `report_photo` held zero rows, the bytes never left the browser, and 8.3.7's "reject a completion that
 * carry photographic evidence" was satisfied by any string at all: `photoKeys:
 * ["not-a-real-file-at-all"]` returned 200 and closed the work order. The acceptance harness read
 * PASS for the requirement throughout, because it checked that a completion with *no* keys was
 * refused and never checked that a key referred to anything.
 *
 * So the gate that mattered was never the upload; it was `exists()`. A system that accepts an
 * unverifiable reference as evidence is not storing evidence, it is storing a claim.
 *
 * **Keys are random, never derived.** 10.3.5 asks for non-enumerable URLs. A key built from the
 * work-order id would let anyone holding one URL walk to every other; a key built from the
 * filename would leak the reporter's device naming (`IMG_4821.jpg` tells you the make, roughly how
 * many photographs they have taken, and sometimes the date).
 *
 * **Buckets are private and there is no public read path.** Every read is a `signedUrl` that
 * expires, which is why the port deliberately has no `publicUrl` method to reach for.
 *
 * Uses `fetch` against Supabase's Storage REST API rather than `@supabase/supabase-js`. The client
 * library is already a dependency, but its storage surface pulls in a browser-oriented upload path
 * and its own error taxonomy for three calls that are one HTTP request each; the REST calls are
 * legible, and the errors arrive as this class's own sentences (10.5.3).
 */
import { randomUUID } from 'node:crypto';
import {
  COMPLETION_EVIDENCE,
  ObjectStorage,
  REPORT_PHOTOS,
  StoredObject,
} from '../../ports/ObjectStorage';

/** 5.1.5: JPEG or PNG, at most 5 MB, at most three per report. */
const PERMITTED_TYPES = ['image/jpeg', 'image/png'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

// Re-exported so existing importers keep working; the names themselves live in the port.
export { COMPLETION_EVIDENCE, REPORT_PHOTOS };
const BUCKETS = new Set<string>([REPORT_PHOTOS, COMPLETION_EVIDENCE]);

export class SupabaseStorageGateway implements ObjectStorage {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async upload(bucket: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    // Validated here rather than only in the browser: 10.3.6 requires server-side validation of
    // every user-supplied input, and a size limit enforced only by the client is not a limit.
    if (!PERMITTED_TYPES.includes(contentType as (typeof PERMITTED_TYPES)[number])) {
      throw new Error(`unsupported image type ${contentType}; JPEG or PNG only (5.1.5)`);
    }
    if (data.byteLength > MAX_BYTES) {
      throw new Error(`image is ${data.byteLength} bytes; the limit is 5 MB (5.1.5)`);
    }
    if (data.byteLength === 0) {
      // Not pedantry. A zero-byte upload succeeds at every layer and produces an object that
      // satisfies `exists()` while being no evidence of anything — precisely the hole this class
      // was written to close, reopened one level down.
      throw new Error('the image is empty (5.1.5)');
    }
    SupabaseStorageGateway.assertBucket(bucket);

    // 10.3.5 — random, and carrying the extension only so a signed URL renders inline rather than
    // downloading. Nothing in the key is derived from the uploader, the work order or the file.
    const key = `${randomUUID()}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
    const response = await this.fetcher(`${this.url}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': contentType,
        // Refuse rather than replace if the key somehow exists. A UUID collision is not a real
        // risk; a bug that reuses a key is, and silently overwriting evidence is the worst
        // available outcome.
        'x-upsert': 'false',
      },
      // `fetch` wants a BodyInit; a bare Uint8Array is not one under lib.dom's typings, and the
      // view is copied into a Blob rather than cast so a subarray cannot smuggle its neighbours.
      body: new Blob([new Uint8Array(data)], { type: contentType }),
    });
    if (!response.ok) {
      throw new Error(`the image could not be stored (${response.status})`);
    }
    return { key, contentType, sizeBytes: data.byteLength };
  }

  /**
   * 8.3.7, 10.3.6 — does this key name an object that is actually here?
   *
   * The method the whole feature turns on. Without it a completion carries a string, and a string
   * is not a photograph. Deliberately answers a boolean rather than throwing: the caller's job is
   * to phrase the refusal for the crew member standing in a stairwell, and it needs to say how many
   * of the keys were bad, which it cannot do if the first one aborts.
   */
  async exists(bucket: string, key: string): Promise<boolean> {
    if (!BUCKETS.has(bucket) || !SupabaseStorageGateway.isPlausibleKey(key)) {
      // Rejected before the network call. A key with a slash in it would otherwise address another
      // bucket's object, or walk out of the bucket entirely.
      return false;
    }
    const response = await this.fetcher(`${this.url}/storage/v1/object/info/${bucket}/${key}`, {
      method: 'GET',
      headers: this.authHeaders(),
    });
    return response.ok;
  }

  /** 10.3.5. A short-lived URL for one object, for one authorised reader. */
  async signedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    SupabaseStorageGateway.assertBucket(bucket);
    const response = await this.fetcher(`${this.url}/storage/v1/object/sign/${bucket}/${key}`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: ttlSeconds }),
    });
    if (!response.ok) {
      throw new Error(`no such image, or it could not be signed (${response.status})`);
    }
    const body = (await response.json()) as { signedURL?: string; signedUrl?: string };
    const path = body.signedURL ?? body.signedUrl;
    if (path === undefined) {
      throw new Error('the storage service returned no signed URL');
    }
    // Supabase answers a path relative to /storage/v1; the caller needs something a browser can open.
    return path.startsWith('http') ? path : `${this.url}/storage/v1${path}`;
  }

  /** 10.4.3. Used when a user's personal data is deleted. */
  async remove(bucket: string, key: string): Promise<void> {
    SupabaseStorageGateway.assertBucket(bucket);
    const response = await this.fetcher(`${this.url}/storage/v1/object/${bucket}/${key}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    // 404 is success for a deletion: the caller asked for the object to be gone and it is gone.
    // Treating it as a failure would make 10.4.3's erasure fail on a retry, which is exactly when
    // it is most likely to be retried.
    if (!response.ok && response.status !== 404) {
      throw new Error(`the image could not be removed (${response.status})`);
    }
  }

  private authHeaders(): Record<string, string> {
    // The service key bypasses row-level security and must never reach a browser. It does not: this
    // class only ever runs on the server, and the client's route to an object is a signed URL.
    return { apikey: this.serviceKey, Authorization: `Bearer ${this.serviceKey}` };
  }

  private static assertBucket(bucket: string): void {
    if (!BUCKETS.has(bucket)) {
      throw new Error(`unknown bucket ${bucket}`);
    }
  }

  /**
   * A key this class could have issued: a UUID and an extension, and nothing else.
   *
   * Checked before the key is put in a URL. `../` and `/` are the reason — a key is interpolated
   * into a path, so an unchecked one is a path traversal with extra steps.
   */
  static isPlausibleKey(key: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/.test(key);
  }
}
