/**
 * D-Fence — My Locations screen (REQUIREMENTS.md 11.2.6).
 * Stereotype: <<boundary>>. Traces: 11.2.6, 3.1.1–3.1.6, 3.1.14, 11.4.2, 11.4.6, 10.5.7.
 *
 * Each card shows the exposure status the server computed (3.1.14) together with **when** it was
 * computed. The timestamp is not decoration: an exposure status is a claim about a moving boundary,
 * and one shown without its age reads as current no matter how old it is (10.5.7).
 *
 * Deletion goes through a confirmation (11.4.6) because it takes the alert subscriptions with it —
 * the dialog says how many, since that is the consequence the user cannot see from the card.
 */
import { useState } from 'react';
import { useLoad } from '../../lib/useLoad';
import { ConfirmDialog, StateView, Toast } from '../../components/States';
import { link } from '../../components/Link';
import { ScreenProps } from '../ScreenProps';

interface LocationCard {
  id: string;
  name: string;
  label: string;
  address: string;
  status: string;
  cluster: string | null;
  caseSize: number | null;
  distanceMetres: number | null;
  evaluatedAt: string | null;
}

export function MyLocationsScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<{ locations: LocationCard[] }>(props.api, '/api/locations', {
    isEmpty: (v) => v.locations.length === 0,
    // 11.4.2 — an empty state says what to do next, not merely that there is nothing here.
    emptyMessage: 'You have not saved any locations yet. Add your home or workplace to be told when a cluster appears nearby.',
  });
  const [pendingDelete, setPendingDelete] = useState<LocationCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function confirmDelete(location: LocationCard): Promise<void> {
    setPendingDelete(null);
    const result = await props.api
      .post<{ subscriptionsRemoved: number }>(`/api/locations/${location.id}/delete`, {})
      .catch(() => null);
    if (result === null) {
      setToast('That location could not be removed. Try again shortly.');
      return;
    }
    setToast(
      result.subscriptionsRemoved === 0
        ? `${location.name} removed.`
        : `${location.name} removed, along with ${result.subscriptionsRemoved} alert subscription(s).`,
    );
    retry();
  }

  return (
    <section data-screen="MyLocations" data-requirement="11.2.6">
      <h1>My locations</h1>
      <a href="/locations/new" onClick={link(props, '/locations/new')}>
        Add a location
      </a>

      <StateView state={state} onRetry={retry}>
        <ul data-part="locations">
          {(value?.locations ?? []).map((location) => (
            <li key={location.id} data-status={location.status}>
              <h2>{location.name}</h2>
              <p data-part="label">{location.label}</p>
              <p data-part="address">{location.address}</p>
              {/* 11.7.5 — the status is a word, never a colour on its own. */}
              <p data-part="status">{describe(location)}</p>
              <p data-part="evaluated">
                {location.evaluatedAt === null
                  ? 'Not yet checked against the cluster feed.'
                  : `Checked ${new Date(location.evaluatedAt).toISOString().slice(0, 16).replace('T', ' ')}.`}
              </p>
              <button type="button" onClick={() => setPendingDelete(location)}>
                Remove {location.name}
              </button>
            </li>
          ))}
        </ul>
      </StateView>

      {pendingDelete === null ? null : (
        <ConfirmDialog
          title={`Remove ${pendingDelete.name}?`}
          body="Any alerts you set up for this location will be removed with it."
          confirmLabel="Remove"
          onConfirm={() => void confirmDelete(pendingDelete)}
          onDismiss={() => setPendingDelete(null)}
        />
      )}
      {toast === null ? null : <Toast message={toast} />}
    </section>
  );
}

/**
 * 3.1.14 — the exposure status as a sentence.
 *
 * "Inside a cluster" and "180 m from a cluster" are different facts and the distance is the one a
 * resident acts on, so it is stated rather than left to the status word alone.
 */
function describe(location: LocationCard): string {
  if (location.cluster === null) {
    return 'No active cluster nearby.';
  }
  const size = location.caseSize === null ? '' : ` (${location.caseSize} case(s))`;
  return location.distanceMetres === null || location.distanceMetres === 0
    ? `Inside the ${location.cluster} cluster${size}.`
    : `${Math.round(location.distanceMetres)} m from the ${location.cluster} cluster${size}.`;
}
