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

/**
 * The server's shape, matched exactly. An earlier version of this file invented `sources` with a
 * `name` and a `publisher`; the endpoint returns `attributions` with `source` and `text`, so the
 * credits list rendered empty — a 10.4.5 obligation silently unmet on the one screen that carries
 * it. Found by the UAT harness, which is the only thing that talks to the real endpoint.
 */
interface Attribution {
  attributions: Array<{ source: string; text: string; licence: string; url: string }>;
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
            {(value?.attributions ?? []).map((attribution) => (
              <li key={attribution.source}>
                {/* The publisher's own wording, not a paraphrase — the licence obliges the text. */}
                <a href={attribution.url}>{attribution.text}</a>
                {attribution.licence === '' ? '' : ` — ${attribution.licence}`}
              </li>
            ))}
          </ul>
        </StateView>
      </section>
    </section>
  );
}
