/**
 * D-Fence — check that the OneMap credentials can mint a token, without printing one.
 *
 *     npx tsx src/tools/onemap-check.ts
 *
 * 3.1.14 and 3.1.15: the token is short-lived and the system is expected to renew it rather than be
 * re-pasted by hand. This tool proves the renewal path works — it forces a fresh token request and
 * then performs a real search with whatever it got.
 *
 * **It never prints the token, or the credentials.** It prints the expiry and the number of
 * candidates, which is everything you need to know that renewal works and nothing you would mind
 * seeing in a terminal that is being shared during a demonstration.
 */
import { ConfigLoader } from '../config/ConfigLoader';
import { HttpClient } from '../boundary/gateways/HttpClient';
import { OneMapGateway } from '../boundary/gateways/OneMapGateway';

async function main(): Promise<void> {
  const config = ConfigLoader.load();
  const email = config.get('ONE_MAP_EMAIL');
  const password = config.get('ONE_MAP_PASSWORD');
  if (email === '' || password === '') {
    console.log('ONE_MAP_EMAIL / ONE_MAP_PASSWORD are not both set — automatic renewal is off.');
    console.log('The pasted ONE_MAP_TOKEN will keep working until it expires, and then stop.');
    process.exitCode = 1;
    return;
  }

  // Deliberately constructed with NO pre-set token, so `requestToken` is the only way this can
  // succeed. Passing the existing one would let a stale-but-valid token disguise a broken renewal.
  const gateway = new OneMapGateway(new HttpClient(), undefined, null, { email, password });
  try {
    await gateway.requestToken();
  } catch (error) {
    console.log('Token request FAILED:', error instanceof Error ? error.message : String(error));
    console.log('The credentials are set but not accepted. Check them at onemap.gov.sg.');
    process.exitCode = 1;
    return;
  }

  const expiry = gateway.tokenExpiresAt();
  console.log(`Token minted from the credentials. Expires ${expiry?.toISOString() ?? 'unknown'}.`);

  const candidates = await gateway.search('Woodlands Ring Road');
  console.log(`Live search returned ${candidates.length} candidate(s) for "Woodlands Ring Road".`);
  console.log(
    candidates.length > 0
      ? 'Automatic renewal works: the pasted ONE_MAP_TOKEN is no longer load-bearing.'
      : 'The token works but the search returned nothing, which is a different problem.',
  );
}

void main().catch((error: unknown) => {
  console.error('onemap-check could not run:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
