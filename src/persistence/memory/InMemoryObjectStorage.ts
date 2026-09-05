/**
 * D-Fence — object storage in a Map.
 * Stereotype: <<persistence>>. Traces: 5.1.5, 8.3.6, 8.3.7, 10.3.5.
 *
 * The development and test twin of `SupabaseStorageGateway`, and it exists for the same reason
 * every other in-memory store here does: the system has to be runnable and testable without
 * credentials to somebody else's service.
 *
 * **It enforces the same rules, deliberately.** A permissive stand-in would let every test pass on
 * a path that fails in production — which is the shape of the defect this whole feature exists to
 * correct, where a harness reported 8.3.7 as met while nothing was stored. So the type check, the
 * size cap, the empty-file refusal and the key format are all applied here too. What it does not
 * do is survive a restart, which is stated rather than hidden.
 */
import { randomUUID } from 'node:crypto';
import { ObjectStorage, StoredObject } from '../../ports/ObjectStorage';

const PERMITTED_TYPES = ['image/jpeg', 'image/png'] as const;
const MAX_BYTES = 5 * 1024 * 1024;

export class InMemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, { data: Uint8Array; contentType: string }>();

  async upload(bucket: string, data: Uint8Array, contentType: string): Promise<StoredObject> {
    if (!PERMITTED_TYPES.includes(contentType as (typeof PERMITTED_TYPES)[number])) {
      throw new Error(`unsupported image type ${contentType}; JPEG or PNG only (5.1.5)`);
    }
    if (data.byteLength > MAX_BYTES) {
      throw new Error(`image is ${data.byteLength} bytes; the limit is 5 MB (5.1.5)`);
    }
    if (data.byteLength === 0) {
      throw new Error('the image is empty (5.1.5)');
    }
    const key = `${randomUUID()}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
    this.objects.set(`${bucket}/${key}`, { data, contentType });
    return { key, contentType, sizeBytes: data.byteLength };
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return this.objects.has(`${bucket}/${key}`);
  }

  async signedUrl(bucket: string, key: string, ttlSeconds: number): Promise<string> {
    if (!this.objects.has(`${bucket}/${key}`)) {
      throw new Error('no such image');
    }
    // Shaped like the real thing — a path with an expiry — so a screen that renders it cannot be
    // written against a form the deployment will never produce.
    return `/dev-storage/${bucket}/${key}?expires=${ttlSeconds}`;
  }

  async remove(bucket: string, key: string): Promise<void> {
    // Deleting what is not there is success, matching the gateway: 10.4.3's erasure must not fail
    // on a retry.
    this.objects.delete(`${bucket}/${key}`);
  }

  /** Test affordance: how many objects are held, so a case can assert bytes really arrived. */
  get size(): number {
    return this.objects.size;
  }
}
