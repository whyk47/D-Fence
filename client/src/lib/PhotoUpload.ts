/**
 * D-Fence — carrying a chosen photograph to the server.
 * Traces: 5.1.5, 8.3.6, 8.3.7, 10.5.3.
 *
 * Both photograph screens used to do the same thing, which was nothing: they took the chosen
 * `File`, kept `file.name`, and sent that as a storage key. The bytes never left the browser, and
 * the server had no way to tell a key from a wish — a completion "carrying evidence" was carrying
 * the string `IMG_4821.jpg`.
 *
 * One helper for both screens, so the size and type rules are stated once and match the server's.
 * They are checked here **as well as** there: the point of a client-side check is to tell someone
 * their photograph is too large before they spend thirty seconds of mobile data discovering it,
 * not to be the enforcement (10.3.6 says the server decides, and it does).
 */
import { ApiClient, ApiError } from './ApiClient';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PERMITTED = ['image/jpeg', 'image/png'];

export interface UploadedPhoto {
  /** The server's opaque key. What the completion or the report actually carries. */
  key: string;
  /** The file's own name, for showing the user which photograph this row is. Never sent as a key. */
  label: string;
  contentType: string;
  sizeBytes: number;
}

/** A refusal phrased for the person holding the phone — cause and remedy, per 10.5.3. */
export interface PhotoFailure {
  cause: string;
  remedy: string;
}

export type UploadOutcome =
  | { ok: true; photo: UploadedPhoto }
  | { ok: false; failure: PhotoFailure };

/** 'report' posts to the report bucket, 'completion' to the evidence bucket. The path decides. */
export type PhotoPurpose = 'report' | 'completion';

const PATHS: Record<PhotoPurpose, string> = {
  report: '/api/uploads/report-photo',
  completion: '/api/uploads/completion-evidence',
};

export async function uploadPhoto(
  api: ApiClient,
  purpose: PhotoPurpose,
  file: File,
): Promise<UploadOutcome> {
  if (!PERMITTED.includes(file.type)) {
    return {
      ok: false,
      failure: {
        cause: `${file.name} is not a JPEG or a PNG`,
        remedy: 'take a photograph with the camera, or choose a JPEG or PNG (5.1.5)',
      },
    };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return {
      ok: false,
      failure: {
        cause: `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        remedy: 'the limit is 5 MB — take the photograph at a lower resolution',
      },
    };
  }
  let data: string;
  try {
    data = await readAsBase64(file);
  } catch {
    return {
      ok: false,
      failure: { cause: 'the photograph could not be read', remedy: 'choose it again' },
    };
  }
  try {
    const stored = await api.post<{ key: string; contentType: string; sizeBytes: number }>(
      PATHS[purpose],
      { contentType: file.type, data },
    );
    return { ok: true, photo: { ...stored, label: file.name } };
  } catch (error) {
    const failure = error instanceof ApiError ? error.failure : null;
    return {
      ok: false,
      failure: {
        cause: failure?.error ?? 'the photograph could not be uploaded',
        remedy: failure?.remedy ?? 'check the connection and try again',
      },
    };
  }
}

/**
 * The bytes, base64-encoded.
 *
 * `readAsDataURL` rather than `readAsArrayBuffer` and a hand-rolled encoder: the browser does the
 * encoding, and the prefix it adds is one the server already strips. Reading a file is
 * callback-shaped, so it is wrapped once here rather than in each screen.
 */
function readAsBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('unreadable'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('unreadable'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(file);
  });
}
