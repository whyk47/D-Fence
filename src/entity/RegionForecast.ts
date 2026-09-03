/**
 * D-Fence — entity class `RegionForecast`
 * Stereotype: <<entity>>. Traces: 1.3.3, 1.3.4, 1.3.5
 *
 * One 24-hour forecast for one of the five macro-regions the endpoint publishes. It is stored
 * rather than consumed and discarded because 1.3.5 requires the heavy-rain flag's *basis* to be
 * inspectable: a manager who asks why a cluster was flagged should be able to read the sentence
 * NEA wrote and the window it applied to, not be told "the system decided".
 */

import { Uuid } from './valueTypes';
import { ForecastRegion } from './enums';

export class RegionForecast {
  id!: Uuid;
  region!: ForecastRegion;
  /** As returned by the API, with the period labels kept. 1.3.5's inspectable basis. */
  forecastText!: string;
  /** 1.3.3 — derived from `forecastText` by ForecastFeedParser.impliesHeavyRain. */
  heavyRainExpected!: boolean;
  validFrom!: Date;
  validTo!: Date;
  /** When this forecast was retrieved, so a stale one can be told from a current one (10.2.2). */
  retrievedAt!: Date;

  /** 1.3.4 — whether the stated validity period covers an instant. Inclusive at both ends. */
  covers(at: Date): boolean {
    return at.getTime() >= this.validFrom.getTime() && at.getTime() <= this.validTo.getTime();
  }
}
