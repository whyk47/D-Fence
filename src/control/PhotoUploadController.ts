/**
 * D-Fence — photograph upload.
 * Stereotype: <<control>>. Traces: 5.1.5, 8.3.6, 8.3.7, 10.3.5, 10.3.6, 10.5.3.
 *
 * The missing half of the evidence story. `ObjectStorage` existed, `report_photo` existed, and the
 * screens collected files — but nothing ever carried the bytes from the browser to the store, so
 * both screens sent `storageKey: file.name` and the server believed them. A completion "carried
 * photographic evidence" that was the string `IMG_4821.jpg`.
 *
 * This class is the only way an image enters the system, which is what lets the rules live in one
 * place: who may upload into which bucket, and what may be uploaded at all.
 *
 * **The two buckets are not interchangeable and the caller does not choose freely.** A resident may
 * put an image in `report-photos` because 5.1.5 says a report may carry photographs; a crew member
 * may put one in `completion-evidence` because 8.3.6 says a completion must. Neither may write to
 * the other's bucket, so the bucket is derived from the permission rather than read from the
 * request — a `bucket` field in the body would be the whole access rule, supplied by the client.
 *
 * **Base64 rather than multipart.** One JSON body, validated by the same path as every other
 * request (10.3.6), and no upload-parsing dependency reading the request stream before
 * authorisation has run. The cost is a third more bytes on the wire, which for a 5 MB cap is a
 * trade worth making for a demonstration system; the gain is that this file has no branch a
 * malformed multipart boundary can reach.
 */
import { AccessControlService } from './AccessControlService';
import { Principal } from './Principal';
import { ObjectStorage, StoredObject } from '../ports/ObjectStorage';
import { COMPLETION_EVIDENCE, REPORT_PHOTOS } from '../ports/ObjectStorage';
import { AuditStore } from '../ports/Stores';

/** What the caller says it is uploading. Never a bucket name — see the class comment. */
export type UploadPurpose = 'report' | 'completion';

const PERMITTED_TYPES = new Set(['image/jpeg', 'image/png']);
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Refused for a reason the uploader can act on, as distinct from a refusal of *authority*.
 *
 * Separate from `NotAuthorised` because the two want opposite answers: this one should say exactly
 * what was wrong (the file is too large, it is a HEIC) since 10.5.3 asks for a remedy and there is
 * no oracle in telling someone the size of their own file. 2.3.7's silence applies to the other.
 */
export class UploadRefused extends Error {
  constructor(
    readonly reason: string,
    readonly remedy: string,
  ) {
    super(reason);
    this.name = 'UploadRefused';
  }
}

export class PhotoUploadController {
  constructor(
    private readonly ac: AccessControlService,
    private readonly storage: ObjectStorage,
    private readonly audit: AuditStore | null = null,
  ) {}

  /**
   * 5.1.5, 8.3.6. Store one image and answer the key that names it.
   *
   * @param base64 the image bytes, base64-encoded, as sent by the browser's FileReader
   * @throws NotAuthorised when the role may not upload for this purpose (2.3.x)
   * @throws UploadRefused when the image itself is unacceptable (5.1.5, 10.3.6)
   */
  async upload(
    purpose: UploadPurpose,
    contentType: string,
    base64: string,
    by: Principal,
  ): Promise<StoredObject> {
    const bucket = purpose === 'report' ? REPORT_PHOTOS : COMPLETION_EVIDENCE;
    // The permission is the one that governs the thing the photograph is *part of*: a resident
    // uploading a report photograph is creating a report, a crew member uploading evidence is
    // progressing a work order. Inventing `photo:upload` would have created a permission that can
    // drift from the action it exists to serve.
    await this.ac.authorise(by, purpose === 'report' ? 'report:create' : 'workOrder:progress', {
      kind: 'photo',
    });

    if (!PERMITTED_TYPES.has(contentType)) {
      throw new UploadRefused(
        `${contentType === '' ? 'that file' : contentType} is not a supported image type`,
        'take a photograph, or choose a JPEG or PNG (5.1.5)',
      );
    }
    const data = PhotoUploadController.decode(base64);
    if (data === null) {
      throw new UploadRefused('the image could not be read', 'choose the photograph again');
    }
    if (data.byteLength === 0) {
      throw new UploadRefused('the image is empty', 'choose the photograph again');
    }
    if (data.byteLength > MAX_BYTES) {
      // Checked here as well as in the gateway. 10.3.6 is about the server validating what the
      // browser sent, and a limit enforced only at the far end of the call is not a limit.
      throw new UploadRefused(
        `the image is ${(data.byteLength / (1024 * 1024)).toFixed(1)} MB`,
        'the limit is 5 MB — take the photograph at a lower resolution (5.1.5)',
      );
    }

    const stored = await this.storage.upload(bucket, data, contentType);
    // 2.4.1 — who put what where. The key is recorded rather than the bytes, which is the whole
    // record anyone auditing an evidence dispute needs.
    await this.audit?.appendAction(by.accountId, 'photo:upload', bucket, stored.key);
    return stored;
  }

  /**
   * Strict base64, decoded without trusting the length.
   *
   * `Buffer.from(s, 'base64')` silently ignores anything it does not recognise, so a body of pure
   * rubbish decodes to an empty buffer rather than failing — which would arrive at the store as a
   * zero-byte "photograph" and satisfy `exists()` forever after. The re-encode comparison is what
   * turns that into a refusal.
   */
  private static decode(base64: string): Uint8Array | null {
    // A data URL is what `FileReader.readAsDataURL` produces, and it is easy to send by accident.
    const payload = base64.startsWith('data:') ? (base64.split(',')[1] ?? '') : base64;
    const cleaned = payload.trim();
    if (cleaned === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
      return null;
    }
    const buffer = Buffer.from(cleaned, 'base64');
    if (buffer.toString('base64').replace(/=+$/, '') !== cleaned.replace(/=+$/, '')) {
      return null;
    }
    return new Uint8Array(buffer);
  }
}
