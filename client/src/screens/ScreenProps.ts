/**
 * D-Fence — the props every screen receives.
 * Traces: 11.2.x, 11.3.2, 2.3.6.
 *
 * One shape for all twenty-seven screens, so the router constructs them uniformly and a new screen
 * needs no edit to `AppShell`. Note what is **not** here: no role flags, no permission booleans, no
 * "canEdit". A screen that branched on a client-side permission would be deciding, and 2.3.6 puts
 * that decision on the server. The screen asks the server and renders the answer.
 */
import { ApiClient } from '../lib/ApiClient';
import { ClientPrincipal } from '../app/RouteGuard';

export interface ScreenProps {
  api: ApiClient;
  /** `:id`-style segments from the matched route. */
  params: Record<string, string>;
  /** Whoever is signed in, or null on the four public screens (11.1.9). */
  principal: ClientPrincipal | null;
  /**
   * The only way a screen changes the URL. Routed through the shell rather than `location.assign`
   * so 11.3.2's "no transition that is not on the dialog map" stays checkable in one place.
   */
  onNavigate: (url: string) => void;
  /** Set after a successful sign-in or sign-out (2.1.8 — the token lives in memory only). */
  onPrincipalChange?: (principal: ClientPrincipal | null, token: string | null) => void;
}
