/**
 * D-Fence — Add Location screen (REQUIREMENTS.md 11.2.7).
 * Stereotype: <<boundary>>. Traces: 11.2.7, 3.1.2–3.1.7, 3.1.13, 3.1.17, 11.5.1, 11.5.2, 10.5.3.
 *
 * Two steps, because 3.1.4 makes them two: the resident types an address, the geocoder proposes
 * candidates, and the resident **chooses**. A screen that silently took the first match would be
 * deciding on their behalf which building they live in — and the addresses OneMap returns for a
 * block number are genuinely ambiguous.
 *
 * 3.1.5 (no such address) and 3.1.17 (geocoder unwell) are different situations with different
 * remedies, and are shown as such: one is "check the spelling", the other is "try again shortly".
 * Collapsing them would tell a resident their real address does not exist.
 */
import { useState } from 'react';
import { ApiError } from '../../lib/ApiClient';
import { Field, field, FormField } from '../../components/Field';
import { evaluate, formIsValid, maxLength, required } from '../../components/FieldValidation';
import { LocationLabel } from '../../../../src/entity/enums';
import { ScreenProps } from '../ScreenProps';

interface Candidate {
  point: { latitude: number; longitude: number };
  address: string;
  postalCode: string | null;
}

/** 3.1.7 — the name a resident gives a location, bounded so a card stays readable. */
const NAME_MAX = 60;

export function AddLocationScreen(props: ScreenProps): JSX.Element {
  const [query, setQuery] = useState<FormField>(field());
  const [name, setName] = useState<FormField>(field());
  const [label, setLabel] = useState<LocationLabel>(LocationLabel.Home);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [failure, setFailure] = useState<{ cause: string; remedy: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const queryRules = [required('Address or postal code')];
  const nameRules = [required('Name'), maxLength(NAME_MAX, '3.1.7')];

  async function search(event: { preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setQuery((f) => ({ ...f, touched: true }));
    if (!formIsValid([evaluate(query.value, queryRules)]) || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    setChosen(null);
    try {
      const result = await props.api.post<{ candidates: Candidate[] }>('/api/locations/search', {
        text: query.value.trim(),
      });
      setCandidates(result.candidates);
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setCandidates(null);
      setFailure({
        cause: f?.error ?? 'the address could not be looked up',
        remedy: f?.remedy ?? 'try again in a few minutes',
      });
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    setName((f) => ({ ...f, touched: true }));
    if (chosen === null || !formIsValid([evaluate(name.value, nameRules)]) || busy) {
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await props.api.post('/api/locations', {
        inputText: query.value.trim(),
        name: name.value.trim(),
        label,
        candidate: {
          latitude: chosen.point.latitude,
          longitude: chosen.point.longitude,
          address: chosen.address,
          postalCode: chosen.postalCode,
        },
      });
      props.onNavigate('/locations');
    } catch (error) {
      const f = error instanceof ApiError ? error.failure : null;
      setFailure({ cause: f?.error ?? 'the location could not be saved', remedy: f?.remedy ?? 'try again shortly' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-screen="AddLocation" data-requirement="11.2.7">
      <h1>Add a location</h1>

      <form onSubmit={search} noValidate>
        <Field
          id="query"
          label="Address or postal code"
          value={query.value}
          touched={query.touched}
          rules={queryRules}
          hint="For example: 117 Ho Ching Road, or 610117."
          onChange={(v) => setQuery({ value: v, touched: query.touched })}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>

      {failure === null ? null : (
        <div role="alert" data-part="error">
          <p>{failure.cause}</p>
          <p>{failure.remedy}</p>
        </div>
      )}

      {/* 3.1.5 — an address that genuinely does not exist is an empty result, not a failure. */}
      {candidates !== null && candidates.length === 0 ? (
        <p data-state="empty">
          No match for that address. Check the spelling, or try the postal code on its own.
        </p>
      ) : null}

      {candidates !== null && candidates.length > 0 ? (
        <fieldset data-part="candidates">
          {/* 3.1.4 — the resident chooses; the system proposes. */}
          <legend>Which one is it?</legend>
          {candidates.map((candidate, index) => (
            <label key={`${candidate.address}-${index}`}>
              <input
                type="radio"
                name="candidate"
                checked={chosen?.address === candidate.address}
                onChange={() => setChosen(candidate)}
              />
              {candidate.address}
              {candidate.postalCode === null ? '' : ` (${candidate.postalCode})`}
            </label>
          ))}
        </fieldset>
      ) : null}

      {chosen === null ? null : (
        <div data-part="details">
          <Field
            id="name"
            label="Name this location"
            value={name.value}
            touched={name.touched}
            rules={nameRules}
            max={NAME_MAX}
            onChange={(v) => setName({ value: v, touched: name.touched })}
          />
          <label htmlFor="label">Type</label>
          <select id="label" value={label} onChange={(e) => setLabel(e.target.value as LocationLabel)}>
            {Object.values(LocationLabel).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save location'}
          </button>
        </div>
      )}
    </section>
  );
}
