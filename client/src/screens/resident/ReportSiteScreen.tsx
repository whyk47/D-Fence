/**
 * D-Fence — Report a Site screen (REQUIREMENTS.md 11.2.8).
 * Stereotype: <<boundary>>. Traces: 11.2.8, 5.1.1–5.1.6, 5.1.15–5.1.17, 11.3.20, 11.5.1–11.5.3,
 * 11.6.x, 10.5.3.
 *
 * **The pest comes first (11.3.20).** Nothing else on the form is active until one is chosen, and
 * that is not a stylistic preference: the pest decides which later fields are mandatory (5.1.16),
 * whether anyone from D-Fence will be sent at all (8.1.14), and who the resident should be calling
 * instead. Asking for a description first and the pest last would collect the answer that changes
 * the form after the form has been filled in.
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
import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, maxLength, required } from '../../components/FieldValidation';
import { LocationContext, PestType, ReportType } from '../../../../src/entity/enums';
import { link } from '../../components/Link';
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

/** One row of /api/pests. The class is what 5.1.16 and 8.1.14 both turn on. */
interface PestRow {
  pestType: string;
  pestClass: string;
  authority: string;
  contactNumber: string;
  referred: boolean;
}

/** 10.5.1 — the data dictionary's identifier, spaced for reading. Not renamed, only spaced. */
function readable(pestType: string): string {
  return pestType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function ReportSiteScreen(props: ScreenProps): JSX.Element {
  // 11.3.20 — no pest chosen yet. Empty rather than defaulted to Mosquito: a defaulted pest type
  // is indistinguishable from a chosen one, and it decides who the case goes to.
  const [pestType, setPestType] = useState<string>('');
  const [locationContext, setLocationContext] = useState<LocationContext | ''>('');
  const [injuryReported, setInjuryReported] = useState(false);
  const [pests, setPests] = useState<PestRow[]>([]);
  const [type, setType] = useState<ReportType>(ReportType.StandingWater);
  const [description, setDescription] = useState<FormField>(field());
  const [latitude, setLatitude] = useState<FormField>(field());
  const [longitude, setLongitude] = useState<FormField>(field());
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // The catalogue, for the labels and — the part that matters — the pest class. Failure is silent
  // on purpose: a resident who cannot reach /api/pests can still file a report, they simply do not
  // get the "AVS handles this" hint. Blocking the form on a reference lookup would be worse.
  //
  // A 200 carrying a body of the wrong shape is the same situation as a failure and is treated as
  // one: a rejected promise is not the only way a reference lookup disappoints, and an unchecked
  // `v.pests` here renders as a crash on the resident's screen rather than a missing hint.
  useEffect(() => {
    props.api
      .get<{ pests?: PestRow[] }>('/api/pests')
      .then((v) => setPests(Array.isArray(v?.pests) ? v.pests : []))
      .catch(() => setPests([]));
  }, [props.api]);

  const chosen = pests.find((p) => p.pestType === pestType) ?? null;
  const isWildlife = chosen?.pestClass === 'Wildlife';
  /** 11.3.20 — everything after the pest is inert until one is chosen. */
  const pestChosen = pestType !== '';

  const descriptionRules = [required('Description'), maxLength(MAX_DESCRIPTION_CHARS, '5.1.4')];
  // 5.1.2 — a report must carry a location. The Singapore bounds are the server's to enforce;
  // the rule here is only that a number was supplied at all.
  const coordinateRules = [
    required('Location'),
    { requirement: '5.1.2', check: (v: string) => (Number.isFinite(Number(v)) ? null : 'that is not a coordinate') },
  ];

  const valid =
    pestChosen &&
    // 5.1.16 — the server refuses a wildlife report with no location context. Enforced here too so
    // the resident is not refused after typing everything else.
    (!isWildlife || locationContext !== '') &&
    formIsValid([
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
        pestType, // 5.1.15
        ...(locationContext === '' ? {} : { locationContext }), // 5.1.16
        ...(injuryReported ? { injuryReported: true } : {}), // 5.1.17
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
      <h1>Report a pest</h1>
      <form onSubmit={submit} noValidate>
        {/* 5.1.15, 11.3.20 — first, and everything else waits on it. */}
        <label htmlFor="pestType">What did you see?</label>
        <select
          id="pestType"
          value={pestType}
          onChange={(e) => {
            setPestType(e.target.value);
            setLocationContext('');
          }}
          data-part="pest-type"
        >
          <option value="">Choose a pest…</option>
          {(pests.length > 0 ? pests.map((p) => p.pestType) : Object.values(PestType)).map((option) => (
            <option key={option} value={option}>
              {readable(option)}
            </option>
          ))}
        </select>

        {/* 8.1.14 in words, and before the form is filled in rather than after it is submitted.
            11.2.27's screen is one click away, which is the dialog map's whoThisHandles transition. */}
        {chosen?.referred === true ? (
          <p data-part="authority" role="status">
            {chosen.authority} handles {readable(chosen.pestType)}, not D-Fence. We will pass this to
            them. If the animal is inside or someone is hurt, call{' '}
            <a href={`tel:${chosen.contactNumber.replace(/\s/g, '')}`}>{chosen.contactNumber}</a>{' '}
            first.{' '}
            <a href="/pests" onClick={link(props, '/pests')}>
              Who handles which pest
            </a>
          </p>
        ) : null}

        {/* 5.1.16 — mandatory for wildlife, because 4.4.7 raises an indoor sighting to Critical and
            cannot do so from a value nobody supplied. Not shown for other pests: an unanswerable
            question on a cockroach report is a question nobody answers accurately. */}
        {isWildlife ? (
          <fieldset data-part="location-context">
            <legend>Where was the animal?</legend>
            {Object.values(LocationContext).map((option) => (
              <label key={option} htmlFor={`context-${option}`}>
                <input
                  id={`context-${option}`}
                  type="radio"
                  name="locationContext"
                  value={option}
                  checked={locationContext === option}
                  onChange={() => setLocationContext(option)}
                />{' '}
                {option === LocationContext.Indoor ? 'Inside a building' : 'Outdoors'}
              </label>
            ))}
          </fieldset>
        ) : null}

        {/* 5.1.17 — optional on any report, and 4.4.8 turns on it. */}
        <label htmlFor="injury">
          <input
            id="injury"
            type="checkbox"
            checked={injuryReported}
            onChange={(e) => setInjuryReported(e.target.checked)}
            disabled={!pestChosen}
          />{' '}
          Someone was hurt
        </label>

        <label htmlFor="type">What did you find?</label>
        <select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value as ReportType)}
          disabled={!pestChosen}
        >
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
