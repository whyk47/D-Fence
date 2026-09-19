/**
 * D-Fence — HighAedesArea (entity).
 * Stereotype: <<entity>>. Traces: 1.1.19, 1.1.20 (the same publisher-stamp discipline), 1.6.7.
 *
 * One polygon from NEA's "Areas with High Aedes Population" — the areas where its Gravitraps
 * caught relatively more *Aedes aegypti*.
 *
 * **What it is not is a case count.** A Gravitrap catches adult mosquitoes; a dengue cluster is
 * people who fell ill. The two answer different questions, which is exactly why this is evidence
 * worth having and also why it cannot simply be added to a score that already counts cases: one
 * locality can appear in both, and a model that treated them as independent would count the same
 * outbreak twice. The decision about how to combine them is recorded, unresolved, in
 * PEST-PRIORITY-MODEL.md §8 step 9.
 *
 * `publishedAt` is NEA's stamp on the dataset and never our load date, for the reason 1.6.7 gives
 * about the operator registry: a date that moves when we fetch says this evidence is current, when
 * all it records is that we asked recently. NEA's own description still says "April to June 2019"
 * while the file is republished — which is precisely why the published date travels with the data
 * and is shown rather than inferred.
 */
import { GeoPoint } from './valueTypes';

export class HighAedesArea {
  constructor(
    /** The publisher's OBJECTID, as text. The store key, so a republished file updates in place. */
    readonly objectId: string,
    readonly name: string,
    readonly description: string,
    /** GeoJSON ring coordinates, [[lng, lat], ...] per ring, per polygon. */
    readonly polygons: ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly [number, number]>>>,
    readonly publishedAt: Date | null = null,
  ) {}

  /**
   * A representative point, for a list that has to show *where* without drawing the polygon.
   *
   * The centroid of the first ring's vertices, which is not the centroid of the area and is not
   * claimed to be: it is a label position. A concave area can put this outside itself, and no
   * caller may use it to decide containment — that is `ST_Intersects`, in the repository, against
   * the polygon this was derived from.
   */
  labelPoint(): GeoPoint | null {
    const ring = this.polygons[0]?.[0];
    if (ring === undefined || ring.length === 0) {
      return null;
    }
    let lng = 0;
    let lat = 0;
    for (const [x, y] of ring) {
      lng += x;
      lat += y;
    }
    return new GeoPoint(lat / ring.length, lng / ring.length);
  }
}
