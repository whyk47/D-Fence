/**
 * D-Fence — OneMapGateway (Adapter).
 * Stereotype: <<boundary>>. Traces: 3.1.3, 3.1.14–3.1.17, 8.1.x.
 *
 * **Verified live 2026-09-03.** `GET /api/common/elastic/search?searchVal=…&returnGeom=Y&getAddrDetails=Y`
 * with the token in the `Authorization` header returns `{found, totalNumPages, pageNum, results[]}`,
 * each result carrying LATITUDE and LONGITUDE **as strings**. An unmatched address is `found: 0`
 * with an empty array, not an error — so "no such address" and "the service is down" are different
 * outcomes here, and only the second one throws.
 *
 * Tokens last three days (3.1.14). The account credentials mint one at
 * `POST /api/auth/post/getToken`; a token supplied through configuration is used as-is until it
 * expires, which is how the team can work from a pasted token before the credentials are shared.
 */
import { GeocodingSource } from '../../ports/ExternalGateway';
import { HttpClient } from './HttpClient';
import { SourceKind } from '../../entity/enums';
import { GeoPoint } from '../../entity/valueTypes';

interface SearchResponse {
  found?: number;
  results?: Array<{ LATITUDE?: string; LONGITUDE?: string; ADDRESS?: string; POSTAL?: string }>;
}

interface TokenResponse {
  access_token?: string;
  expiry_timestamp?: string | number;
}

export interface OneMapCredentials {
  email: string;
  password: string;
}

export class OneMapGateway implements GeocodingSource {
  constructor(
    private readonly http: HttpClient,
    private readonly baseUrl = 'https://www.onemap.gov.sg',
    token: string | null = null,
    private readonly credentials: OneMapCredentials | null = null,
  ) {
    this.token = token;
    // A token pasted into configuration carries its own expiry in the JWT. Read it rather than
    // assuming three days from now: a token minted on Monday and pasted on Wednesday has one day
    // left, and assuming otherwise turns a refresh into a run of 401s mid-demo.
    this.tokenExpiry = token === null ? null : OneMapGateway.expiryOf(token);
  }

  private token: string | null;
  private tokenExpiry: Date | null;

  sourceKind(): SourceKind {
    return SourceKind.Geocoding;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.search('Orchard Road');
      return true;
    } catch {
      return false;
    }
  }

  /** 3.1.14 — mint a token from the account credentials. */
  async requestToken(): Promise<void> {
    if (this.credentials === null) {
      throw new Error('no OneMap credentials configured; set ONE_MAP_EMAIL and ONE_MAP_PASSWORD');
    }
    const res = await this.http.post(`${this.baseUrl}/api/auth/post/getToken`, this.credentials, {
      attempts: 2,
    });
    if (!res.ok) {
      throw new Error(`OneMap token request failed: ${res.status}`);
    }
    const body = (await res.json()) as TokenResponse;
    if (!body.access_token) {
      throw new Error('OneMap token response carried no access_token');
    }
    this.token = body.access_token;
    this.tokenExpiry =
      body.expiry_timestamp === undefined
        ? OneMapGateway.expiryOf(body.access_token)
        : new Date(Number(body.expiry_timestamp) * 1000);
  }

  /**
   * 3.1.15 — refresh before use rather than after a failure. The margin is an hour: a token that
   * expires mid-request produces a 401 the user sees, and the refresh costs one call every few days.
   */
  private async ensureToken(): Promise<void> {
    const marginMs = 60 * 60 * 1000;
    const expired = this.tokenExpiry === null || this.tokenExpiry.getTime() - Date.now() < marginMs;
    if (this.token === null || expired) {
      await this.requestToken();
    }
  }

  /**
   * 3.1.3 — resolve an address to coordinates.
   * @returns every match, in OneMap's own ranking order; empty when the address does not exist.
   */
  async search(address: string): Promise<GeoPoint[]> {
    await this.ensureToken();
    const url =
      `${this.baseUrl}/api/common/elastic/search` +
      `?searchVal=${encodeURIComponent(address)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const res = await this.http.get(url, {
      headers: { Authorization: this.token as string },
      attempts: 2,
    });
    if (res.status === 401) {
      // 3.1.16: one forced refresh, then give up. Retrying a bad credential in a loop locks accounts.
      await this.requestToken();
      return this.search(address);
    }
    if (!res.ok) {
      throw new Error(`OneMap search failed: ${res.status}`);
    }
    const body = (await res.json()) as SearchResponse;
    return (body.results ?? [])
      .filter((r) => r.LATITUDE !== undefined && r.LONGITUDE !== undefined)
      .map((r) => new GeoPoint(Number(r.LATITUDE), Number(r.LONGITUDE)));
  }

  /** Reads `exp` out of the JWT without verifying it — this is scheduling, not authentication. */
  private static expiryOf(token: string): Date | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const claims = parts[1];
    if (claims === undefined) {
      return null;
    }
    try {
      const payload = JSON.parse(Buffer.from(claims, 'base64').toString('utf8')) as { exp?: number };
      return payload.exp === undefined ? null : new Date(payload.exp * 1000);
    } catch {
      return null;
    }
  }
}
