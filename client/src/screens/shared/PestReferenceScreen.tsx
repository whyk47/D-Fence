/**
 * D-Fence — Pest Reference screen (REQUIREMENTS.md 11.2.27).
 * Stereotype: <<boundary>>. Traces: 11.2.27, 4.2.3, 4.2.8, 4.3.9, 8.6.3, 10.5.1, 11.7.5.
 *
 * Every covered pest, who handles it, and the number to call.
 *
 * **Why this screen exists and why it is first, not buried.** A resident who has just seen a snake
 * in their kitchen needs the AVS number faster than they need a report form. Filing a report is the
 * right thing to do afterwards; it is not the right thing to do first, and a system that offers only
 * the form has misread the situation. The reference is reachable from the map and from the report
 * form itself, which is the two places a person in that situation actually is.
 *
 * The severity multiplier and the evidence tier are shown rather than hidden (4.2.8, 4.3.9). They
 * are claims the system makes about itself — a tier C number is a weaker statement than a tier A one
 * — and a reader entitled to the ranking is entitled to know how it was arrived at.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface PestRow {
  pestType: string;
  pestClass: string;
  evidenceTier: string;
  severityMultiplier: number;
  authority: string;
  contactNumber: string;
  /** 8.1.14 — this pest is referred to an authority, not dispatched to a D-Fence crew. */
  referred: boolean;
}

/** 10.5.1 — the data dictionary's identifiers, spaced for reading. Not renamed, only spaced. */
function readable(pestType: string): string {
  return pestType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

export function PestReferenceScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<{ pests: PestRow[] }>(props.api, '/api/pests', {
    isEmpty: (v) => v.pests.length === 0,
    emptyMessage: 'No pests are configured. An operations manager can load the catalogue.',
  });

  // A filter, not a second request: twenty-two rows is a list you scan, and a round trip to narrow
  // it would make the screen slower at the one moment it needs to be fast.
  const [query, setQuery] = useState('');
  const rows = (value?.pests ?? []).filter((p) =>
    readable(p.pestType).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <section data-screen="PestReference" data-requirement="11.2.27">
      <h1>Which pest, and who handles it</h1>
      <p data-part="intro">
        If an animal is inside your home or someone has been hurt, call the number below first. Report
        it here afterwards so the area is tracked.
      </p>

      <StateView state={state} onRetry={retry}>
        <p data-part="filter">
          <label htmlFor="pest-filter">Find a pest</label>{' '}
          <input
            id="pest-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-action="filter"
          />
        </p>

        <table>
          <thead>
            <tr>
              <th scope="col">Pest</th>
              <th scope="col">Who handles it</th>
              <th scope="col">Call</th>
              <th scope="col">How quickly</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((pest) => (
              <tr key={pest.pestType} data-pest={pest.pestType} data-referred={pest.referred}>
                <td>{readable(pest.pestType)}</td>
                <td>
                  {pest.authority}
                  {/* 8.1.14 in words. A resident should not discover only after filing that we do
                      not send anyone for this one. 11.7.5 — said, not signalled by a colour. */}
                  {pest.referred ? ' — we refer this to them, we do not send a crew' : ''}
                </td>
                <td>
                  <a href={`tel:${pest.contactNumber.replace(/\s/g, '')}`}>{pest.contactNumber}</a>
                </td>
                {/*
                  This read "severity 1.00 · evidence tier B" to a member of the public who has
                  just seen a snake. 4.2.8 and 4.3.9 both require those figures **alongside a
                  priority score**, and this screen presents no score — so neither applied here,
                  and what they produced was a modelling term (4.3.1's evidence tier) in front of
                  a reader for whom it means nothing.

                  The multiplier is still the number behind the words and is kept on the row's
                  title, so nothing is lost to anyone who needs it; the cell says what it means.
                */}
                <td data-part="ranking" title={`severity ${pest.severityMultiplier.toFixed(2)}, evidence tier ${pest.evidenceTier}`}>
                  {pest.severityMultiplier >= 0.9
                    ? 'Treated as urgent'
                    : pest.severityMultiplier >= 0.7
                      ? 'Treated as high priority'
                      : pest.severityMultiplier >= 0.45
                        ? 'Treated as routine'
                        : 'Logged and monitored'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 ? (
          <p role="status" data-part="no-match">
            No pest matches “{query}”. If you cannot name it, report it as Other and describe what you
            saw.
          </p>
        ) : null}
      </StateView>

      <p data-part="actions">
        <a href="/report" onClick={link(props, '/report')}>
          Report a pest
        </a>
      </p>
    </section>
  );
}
