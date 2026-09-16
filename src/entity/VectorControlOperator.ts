/**
 * D-Fence — VectorControlOperator (entity).
 * Stereotype: <<entity>>. Traces: 1.6.2, 1.6.4, 1.6.7, 1.6.8, 4.1.25.
 * Data dictionary: `lab3/DATA-DICTIONARY-DELTA.md` §3.
 *
 * One row of NEA's Registered Vector Control Operator dataset, after geocoding.
 *
 * **What this is, and what it is not.** It is a *registered office* — the address a pest-control
 * business gave NEA when it licensed. It is not a service area, a depot, or any statement about
 * where that operator works. The distinction is the whole reason `ResponseCapacityDeficit` carries
 * weight 0.05 in every tier: the top streets in the file are Bukit Batok Crescent, Anson Road and
 * Woodlands Industrial Park E5, which is where firms rent offices, not where pests are. Read as
 * demand, this data would rank industrial land above the housing estates that generate the
 * complaints. Read as *how far help has to come*, it is honest.
 *
 * `publishedAt` travels with every operator rather than sitting in one place, because 1.6.7 is a
 * display obligation on every surface that shows the registry, and a date held somewhere else is a
 * date a new screen will forget to fetch.
 */
import { GeoPoint } from './valueTypes';

export class VectorControlOperator {
  constructor(
    readonly companyName: string,
    readonly blockOrHouseNumber: string,
    readonly streetName: string,
    readonly postalCode: string,
    readonly telephoneNumber: string,
    /** Null until 1.6.4 resolves it. A row is stored ungeocoded rather than dropped: the company
     *  name and telephone are useful to an operator on their own, and 1.6.8 simply skips it. */
    readonly location: GeoPoint | null = null,
    /** 1.6.7 — the source dataset's own publication date, never the load date. */
    readonly publishedAt: Date | null = null,
  ) {}

  /** The one-line address, as it would be read out. Used for the geocode and for display. */
  address(): string {
    return [this.blockOrHouseNumber, this.streetName, `Singapore ${this.postalCode}`]
      .filter((part) => part !== '')
      .join(' ');
  }

  withLocation(location: GeoPoint, publishedAt: Date | null): VectorControlOperator {
    return new VectorControlOperator(
      this.companyName,
      this.blockOrHouseNumber,
      this.streetName,
      this.postalCode,
      this.telephoneNumber,
      location,
      publishedAt,
    );
  }
}
