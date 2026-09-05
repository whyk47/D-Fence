/**
 * D-Fence — Report a Site screen (REQUIREMENTS.md 11.2.8).
 * Stereotype: <<boundary>>. Traces: 11.2.8, 5.1.1–5.1.6, 11.5.1–11.5.3, 11.6.x, 10.5.3.
 *
 * The character counter is present from the first keystroke rather than appearing at 500 (11.5.2).
 * A counter that materialises at the moment of failure is a reprimand; one that is always there is
 * a guide, and it is the same limit the server enforces at 5.1.4, imported from the same constant
 * rather than retyped — a client limit that drifts from the server's is worse than none, because
 * it rejects submissions the system would have accepted.
 *
 * The photo rules (5.1.5, 5.1.6) are checked here **and** on the server. That is not duplication to
 * be tidied away later: the client check exists so a resident on a phone learns their 12 MB photo
 * is too large before uploading it over mobile data, and the server check exists because the client
 * one is advisory.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, maxLength, required } from '../../components/FieldValidation';
import { ReportType } from '../../../../src/entity/enums';
import { MAX_DESCRIPTION_CHARS } from '../../../../src/control/ReportController';
import { MAX_PHOTOS_PER_REPORT, MAX_PHOTO_BYTES } from '../../../../src/entity/ReportPhoto';
import { uploadPhoto } from '../../lib/PhotoUpload';
import { ScreenProps } from '../ScreenProps';

interface PhotoDraft {
  filename: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

/** The words a resident uses, mapped to the enum the data dictionary uses (10.5.1). */
const TYPE_LABELS: Record<ReportType, string> = {
  [ReportType.StandingWater]: 'Standing water',
  [ReportType.UnclearedRefuse]: 'Uncleared refuse',
  [ReportType.BlockedDrain]: 'Blocked drain',
  [ReportType.OvergrownVegetation]: 'Overgrown vegetation',
  [ReportType.Other]: 'Something else',
};

const MEGABYTE = 1024 * 1024;

export function ReportSiteScreen(props: ScreenProps): JSX.Element {
  const [type, setType] = useState<ReportType>(ReportType.StandingWater);
  const [description, setDescription] = useState<FormField>(field());
  const [latitude, setLatitude] = useState<FormField>(field());
  const [longitude, setLongitude] = useState<FormField>(field());
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const descriptionRules = [required('Description'), maxLength(MAX_DESCRIPTION_CHARS, '5.1.4')];
  // 5.1.2 — a report must carry a location. The Singapore bounds are the server's to enforce;
  // the rule here is only that a number was supplied at all.
  const coordinateRules = [
    required('Location'),
    { requirement: '5.1.2', check: (v: string) => (Number.isFinite(Number(v)) ? null : 'that is not a coordinate') },
  ];

  const valid = formIsValid([
    evaluate(description.value, descriptionRules),
    evaluate(latitude.value, coordinateRules),
    evaluate(longitude.value, coordinateRules),
  ]);

  /**
   * 5.1.5, 5.1.6 — refuse locally what the server would refuse, before it costs an upload; then
   * actually upload what survives.
   *
   * The three checks below are unchanged and still run first, because their whole value is that
   * they cost nothing. What changed is the last line: it used to store `storageKey: file.name`,
   * so a report was filed referring to photographs that had never been sent anywhere. The key now
   * comes back from the server, and it is the only thing that can.
   */
  function addPhoto(file: File): void {
    if (photos.length >= MAX_PHOTOS_PER_REPORT) {
      setFailure({
        cause: `a report may carry at most ${MAX_PHOTOS_PER_REPORT} photographs`,
        remedy: 'remove one before adding another',
      });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFailure({
        cause: `${file.name} is ${(file.size / MEGABYTE).toFixed(1)} MB; the limit is ${MAX_PHOTO_BYTES / MEGABYTE} MB`,
        remedy: 'choose a smaller photograph, or reduce its resolution',
      });
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type.toLowerCase())) {
      setFailure({
        cause: `${file.name} is a ${file.type}; only JPEG and PNG photographs are accepted`,
        remedy: 'choose a JPEG or PNG photograph',
      });
      return;
    }
    setFailure(null);
    setUploading(true);
    void uploadPhoto(props.api, 'report', file).then((outcome) => {
      if (outcome.ok) {
        setPhotos((current) => [
          ...current,
          {
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            storageKey: outcome.photo.key,
          },
        ]);
      } else {
        setFailure(outcome.failure);
      }
      setUploading(false);
    });
  }

  /** 11.6.x — the device's own position, which is what a resident standing at the site has. */
  function useMyLocation(): void {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setLatitude({ value: position.coords.latitude.toFixed(6), touched: true });
        setLongitude({ value: position.coords.longitude.toFixed(6), touched: true });
      },
      () =>
        setFailure({
          cause: 'your device would not share its location',
          // The manual fields stay available, so a refused permission is not a dead end.
          remedy: 'allow location access, or type the coordinates below',
        }),
    );
  }

  async function submit(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setDescription((f) => ({ ...f, touched: true }));
    setLatitude((f) => ({ ...f, touched: true }));
    setLongitude((f) => ({ ...f, touched: true }));
    if (!valid || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      const result = await props.api.post<{ reportId: string }>('/api/reports', {
        latitude: Number(latitude.value),
        longitude: Number(longitude.value),
        type,
        description: description.value.trim(),
        photos,
      });
      props.onNavigate(`/reports/${result.reportId}`);
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({
        cause: f?.error ?? 'the report could not be submitted',
        remedy: f?.remedy ?? 'correct the submission and try again',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-screen="ReportSite" data-requirement="11.2.8">
      <h1>Report a site</h1>
      <form onSubmit={submit} noValidate>
        <label htmlFor="type">What did you find?</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
          {Object.values(ReportType).map((option) => (
            <option key={option} value={option}>
              {TYPE_LABELS[option]}
            </option>
          ))}
        </select>

        <Field
          id="description"
          label="Describe what you saw"
          multiline
          value={description.value}
          touched={description.touched}
          rules={descriptionRules}
          max={MAX_DESCRIPTION_CHARS}
          onChange={(v) => setDescription({ value: v, touched: description.touched })}
        />

        <fieldset data-part="location">
          <legend>Where is it?</legend>
          <button type="button" onClick={useMyLocation}>
            Use my current location
          </button>
          <Field
            id="latitude"
            label="Latitude"
            value={latitude.value}
            touched={latitude.touched}
            rules={coordinateRules}
            onChange={(v) => setLatitude({ value: v, touched: latitude.touched })}
          />
          <Field
            id="longitude"
            label="Longitude"
            value={longitude.value}
            touched={longitude.touched}
            rules={coordinateRules}
            onChange={(v) => setLongitude({ value: v, touched: longitude.touched })}
          />
        </fieldset>

        <fieldset data-part="photos">
          <legend>Photographs (optional, up to {MAX_PHOTOS_PER_REPORT})</legend>
          <label htmlFor="photo">Add a photograph</label>
          <input
            id="photo"
            type="file"
            accept="image/jpeg,image/png"
            // 11.8.13 — on a phone this opens the rear camera directly instead of the photo
            // library. A resident is standing at the drain and a crew member is standing in it;
            // the photograph they need does not exist yet, so offering a gallery first is one tap
            // in the wrong direction. Desktop browsers ignore the attribute.
            capture="environment"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                addPhoto(file);
              }
              // Cleared so the same photograph can be chosen again after a failure.
              event.target.value = '';
            }}
          />
          {uploading ? (
            <p role="status" data-part="uploading">
              Uploading the photograph…
            </p>
          ) : null}
          <ul>
            {photos.map((photo, index) => (
              <li key={photo.storageKey}>
                {photo.filename}
                <button type="button" onClick={() => setPhotos(photos.filter((_, i) => i !== index))}>
                  Remove {photo.filename}
                </button>
              </li>
            ))}
          </ul>
        </fieldset>

        {failure === null ? null : (
          <div role="alert" data-part="error">
            <p>{failure.cause}</p>
            <p>{failure.remedy}</p>
          </div>
        )}
        <button type="submit" disabled={busy || uploading}>
          {busy ? 'Submitting…' : 'Submit report'}
        </button>
      </form>
    </section>
  );
}
