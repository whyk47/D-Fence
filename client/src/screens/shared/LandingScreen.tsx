/**
 * D-Fence — Landing screen (REQUIREMENTS.md 11.2.1).
 * Stereotype: <<boundary>>. Traces: 11.2.1, 11.1.9, 10.4.5, 10.4.6.
 *
 * The only screen that must render usefully for someone with no account, no session and no data.
 *
 * It carries the source attribution because 10.4.5 requires it to be reachable **without signing
 * in** — the data comes from NEA, the Meteorological Service and OneMap under terms that oblige
 * public credit, and crediting them only behind a login credits them to nobody. `/api/attribution`
 * is the one unauthenticated endpoint for exactly this reason.
 */
import { useLoad } from '../../lib/useLoad';
import { StateView } from '../../components/States';
import { link } from '../../components/Link';
import { homeFor } from '../../app/RouteGuard';
import { ScreenProps } from '../ScreenProps';

interface Attribution {
  sources: Array<{ name: string; publisher: string; licence: string; url: string }>;
}

export function LandingScreen(props: ScreenProps): JSX.Element {
  const { state, value, retry } = useLoad<Attribution>(props.api, '/api/attribution');

  return (
    <section data-screen="Landing" data-requirement="11.2.1">
      <h1>D-Fence</h1>
      <p>
        Dengue cluster monitoring for Singapore. See which areas are active near you, report a
        breeding site, and get told when a cluster appears at a place you care about.
      </p>

      <nav aria-label="Get started">
        {props.principal === null ? (
          <>
            <a href="/signin" onClick={link(props, '/signin')}>
              Sign in
            </a>
            <a href="/register" onClick={link(props, '/register')}>
              Create an account
            </a>
          </>
        ) : (
          // Someone already signed in has no business being sent back to a sign-in button; send
          // them where their role starts.
          <a href={homeFor(props.principal.role)} onClick={link(props, homeFor(props.principal.role))}>
            Continue
          </a>
        )}
      </nav>

      {/* 10.4.5 — public credit, on the public screen. */}
      <section data-part="attribution">
        <h2>Data sources</h2>
        <StateView state={state} onRetry={retry}>
          <ul>
            {(value?.sources ?? []).map((source) => (
              <li key={source.name}>
                <a href={source.url}>{source.name}</a> — {source.publisher}, {source.licence}
              </li>
            ))}
          </ul>
        </StateView>
      </section>
    </section>
  );
}
