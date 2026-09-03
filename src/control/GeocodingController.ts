/**
 * D-Fence — address lookup and OneMap token lifetime.
 * Stereotype: <<control>>. Realises use cases 8.1, 7.7. Traces: 3.1.3–3.1.5, 3.1.13–3.1.17.
 *
 * The whole point of this class is the distinction 3.1.13 and 3.1.17 draw between two failures that
 * a naive implementation collapses into one:
 *
 *  - **"No such address"** — OneMap answered, and the answer was `found: 0`. The resident should
 *    correct what they typed.
 *  - **"Address lookup is unavailable"** — OneMap did not answer, or answered with an error. The
 *    resident should try later, and nothing they retype will help.
 *
 * Telling a resident their address does not exist because a token expired is the failure this
 * separation exists to prevent, and it is why the gateway returning an empty array and the gateway
 * throwing are handled differently here rather than caught together.
 */
import { GeocodeCandidate, GeocodingSource } from '../ports/ExternalGateway';
import { SourceKind } from '../entity/enums';

/** 3.1.4 — at most five candidates go to the confirmation screen. */
export const MAX_CANDIDATES = 5;

/** 3.1.5, 3.1.13. The address was looked up successfully and does not exist. */
export class AddressNotFound extends Error {
  constructor(readonly searched: string) {
    super(`no match was found for "${searched}"`);
    this.name = 'AddressNotFound';
  }
}

/** 3.1.17. The lookup itself failed. Deliberately NOT a subclass of AddressNotFound. */
export class GeocodingUnavailable extends Error {
  /** `override` because `Error.cause` exists in this lib target; ours is always a string. */
  constructor(override readonly cause: string) {
    super('address lookup is temporarily unavailable; please try again shortly');
    this.name = 'GeocodingUnavailable';
  }
}

export class GeocodingController {
  /** 3.1.16 — set when a lookup fails on authentication, and read by the dashboard's source health. */
  private authFailure: { at: Date; detail: string } | null = null;

  constructor(private readonly geocoder: GeocodingSource) {}

  /**
   * 3.1.3, 3.1.4, 3.1.5. Up to five candidates for confirmation.
   *
   * @throws AddressNotFound when the service answered and found nothing (3.1.13)
   * @throws GeocodingUnavailable when the service could not be asked (3.1.17)
   */
  async geocode(text: string): Promise<GeocodeCandidate[]> {
    const searched = text.trim();
    if (searched === '') {
      throw new AddressNotFound(searched); // an empty search is a user error, not an outage
    }
    let candidates: GeocodeCandidate[];
    try {
      candidates = await this.geocoder.search(searched);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (/401|403|token|auth/i.test(detail)) {
        this.authFailure = { at: new Date(), detail }; // 3.1.16
      }
      throw new GeocodingUnavailable(detail); // 3.1.17 — never "no match found"
    }
    if (candidates.length === 0) {
      throw new AddressNotFound(searched); // 3.1.5, 3.1.13
    }
    // 3.1.4 caps the list rather than the query: OneMap ranks its own results, and taking the top
    // five of a good ranking is better than asking for five and getting an arbitrary five.
    return candidates.slice(0, MAX_CANDIDATES);
  }

  /**
   * 3.1.14, 3.1.15. Called on a schedule rather than on demand.
   *
   * The gateway already refreshes lazily an hour before expiry, so this is the belt to that
   * bracer: a deployment that geocodes nothing for four days would otherwise let the token lapse
   * unnoticed and discover it at the first request — which, on an eleven-week project, is the demo.
   */
  async refreshToken(): Promise<void> {
    try {
      await this.geocoder.requestToken();
      this.authFailure = null;
    } catch (error) {
      this.authFailure = { at: new Date(), detail: error instanceof Error ? error.message : String(error) };
      throw new GeocodingUnavailable(this.authFailure.detail);
    }
  }

  /** 3.1.16, 10.2.x — for the dashboard's source-health panel. */
  health(): { source: SourceKind; healthy: boolean; detail: string | null; since: Date | null } {
    return {
      source: SourceKind.Geocoding,
      healthy: this.authFailure === null,
      detail: this.authFailure?.detail ?? null,
      since: this.authFailure?.at ?? null,
    };
  }
}
