/**
 * D-Fence — Dispatch Proposal (REQUIREMENTS.md 11.2.16).
 * Stereotype: <<boundary>>. Traces: 11.2.16, 8.1.7, 8.1.8, 8.1.11, 8.1.12, 11.4.2.
 *
 * **The system proposes; the manager disposes.** 8.1.8 is explicit that the daily list is a
 * suggestion, and this screen never creates anything on its own — each row carries the manager to
 * the create form with the proposal pre-filled. An "accept all" button would make the ranking an
 * instruction rather than advice, and 4.1.x's scores are advisory by design: they are computed from
 * feeds that go stale and drivers that get excluded.
 *
 * The date is Singapore's, not the browser's, and it comes from the server with the proposals so
 * the heading and the list cannot disagree.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { Pill, tierTone } from '../../components/Presentation';
import { label } from '../../lib/labels';
import { ScreenProps } from '../ScreenProps';

interface DispatchPayload {
  date: string;
  proposals: Array<{
    clusterId: string;
    locality: string;
    score: number;
    tier: string;
    suggestedTaskType: string;
    scheduledDate: string;
  }>;
}

export function DispatchProposalScreen(props: ScreenProps): JSX.Element {
  const [date, setDate] = useState<string>('');
  const path = date === '' ? '/api/ops/dispatch' : `/api/ops/dispatch?date=${encodeURIComponent(date)}`;
  const { state, value, retry } = useLoad<DispatchPayload>(props.api, path, {
    isEmpty: (v) => v.proposals.length === 0,
    emptyMessage:
      'Nothing is proposed for this date. Either every ranked cluster already has an open work order, or no scoring cycle has run.',
  });

  return (
    <section data-screen="DispatchProposal" data-requirement="11.2.16">
      {/* The date comes back with the payload, so the heading always names the list below it. */}
      <h1>Dispatch for {value?.date ?? 'today'}</h1>
      <p>
        These are suggestions based on the latest priority ranking. Nothing is created until you
        raise a work order.
      </p>

      <label htmlFor="date">Show another date</label>
      <input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

      <StateView state={state} onRetry={retry}>
        <ol data-part="proposals" data-cards>
          {(value?.proposals ?? []).map((proposal) => (
            <li key={proposal.clusterId} data-tier={proposal.tier}>
              <div data-part="card-head">
                <h2>{proposal.locality}</h2>
                <Pill tone={tierTone(proposal.tier)} tier={proposal.tier}>
                  {proposal.tier} priority
                </Pill>
              </div>
              <div data-part="card-meta">
                {/* Mono, because it is a number being compared down a column of other numbers. */}
                <span data-part="score" className="num">
                  score {proposal.score.toFixed(1)}
                </span>
                <span data-part="task">Suggested: {label(proposal.suggestedTaskType)}</span>
              </div>
              {/*
                The two links were adjacent elements with no whitespace between them in the JSX,
                so the browser ran them together into one underlined sentence. They are a row of
                actions, which is what they always were.
              */}
              <div data-part="card-actions">
              <a
                href={`/ops/work-orders/new?clusterId=${proposal.clusterId}&taskType=${proposal.suggestedTaskType}&date=${proposal.scheduledDate}`}
                onClick={link(
                  props,
                  `/ops/work-orders/new?clusterId=${proposal.clusterId}&taskType=${proposal.suggestedTaskType}&date=${proposal.scheduledDate}`,
                )}
              >
                Raise a work order
              </a>
              <a href={`/ops/clusters/${proposal.clusterId}`} onClick={link(props, `/ops/clusters/${proposal.clusterId}`)}>
                Why is this ranked here?
              </a>
              </div>
            </li>
          ))}
        </ol>
      </StateView>
    </section>
  );
}
