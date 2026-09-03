/**
 * D-Fence — entity class `ReportPhoto`
 * Stereotype: <<entity>>. Traces: 5.1.5, 5.1.6, 5.3.5, 10.3.5.
 */

import { Uuid } from './valueTypes';

/** 5.1.6 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/png'];
/** 5.1.5 */
export const MAX_PHOTOS_PER_REPORT = 3;

/** What the boundary layer hands in: the file's metadata, never the bytes. */
export interface PhotoUpload {
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Written by the object-storage adapter; the database holds the key, not the image (10.3.5). */
  storageKey: string;
}

export class ReportPhoto {
  id!: Uuid;
  reportId!: Uuid;
  /** object storage, not the database */
  storageKey!: string;
  contentType!: string;
  sizeBytes!: number;

  /**
   * 5.1.6 — the rejection rule, stated once. It lives on the entity rather than in
   * ReportController because the same rule governs any future upload path (the mobile client,
   * a bulk import), and a rule copied into a second caller is a rule that will diverge.
   *
   * @returns null when acceptable, otherwise the reason, phrased for the resident (10.5.3).
   */
  static rejectionReasonFor(upload: PhotoUpload): string | null {
    if (!ACCEPTED_PHOTO_TYPES.includes(upload.contentType.toLowerCase())) {
      return `${upload.filename} is a ${upload.contentType}; only JPEG and PNG photographs are accepted`;
    }
    if (upload.sizeBytes > MAX_PHOTO_BYTES) {
      return `${upload.filename} is ${(upload.sizeBytes / 1_048_576).toFixed(1)} MB; the limit is 5 MB`;
    }
    return null;
  }
}
