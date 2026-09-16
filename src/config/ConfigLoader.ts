/**
 * D-Fence — configuration loading.
 * Traces: 4.1.5, 4.1.9, 10.3.4, 10.6.2.
 *
 * Two sources, deliberately separate:
 * - `config/scoring.default.json` — the tunable model. Committed, because the team must be able to
 *   read and argue over the weights (SCORING-SPEC.md).
 * - `src/.env` and the process environment — secrets. Never committed; `.gitignore` covers `.env`.
 *
 * The .env parser is eight lines rather than a dependency: it reads `KEY=value`, strips optional
 * quotes, ignores blanks and `#` comments. A OneMap JWT contains `.` and `-` and no `=` inside the
 * value we care about, so nothing here needs to be cleverer than a first-`=` split.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigSet } from './ConfigSet';
import {
  Driver, EvidenceTier, LocationContext, PestClass, PestType, SourceKind,
} from '../entity/enums';
import { TierThresholds } from '../entity/valueTypes';
import { PestProfile } from '../entity/PestProfile';
import { CriticalOverrideRule } from '../control/scoring/CriticalOverrideEvaluator';

interface ScoringFile {
  driverWeights?: Record<string, number>;
  tierThresholds?: { high: number; medium: number };
  normalisation?: Record<string, { referenceMax?: number; capMm?: number; capReports?: number; saturationDays?: number; capMetres?: number }>;
  ingestionIntervalsSeconds?: Record<string, number>;
  sources?: { clusters?: { datasetId?: string; metadataUrl?: string; pollDownloadUrl?: string } };
}

/** `config/pests.default.json`. Traces 4.2.2, 4.2.3, 4.3.7, 4.4.2. */
interface PestFile {
  driverWeightsByTier?: Record<string, Record<string, number | string>>;
  authorities?: Record<string, { name?: string; contactNumber?: string }>;
  pests?: Array<{
    pestType?: string;
    pestClass?: string;
    evidenceTier?: string;
    severityMultiplier?: number;
    authority?: string;
    observationTaxonId?: number | null;
  }>;
  criticalOverrideRules?: Record<
    string,
    {
      pestClass?: string;
      locationContext?: string;
      injuryReported?: boolean;
      description?: string;
    }
  >;
}

/** Repository root, derived from this file rather than from process.cwd(): `npm test` and
 *  `npm run ingest` run from different directories and both must find the same config. */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export class ConfigLoader {
  static parseEnv(text: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      const eq = trimmed.indexOf('=');
      if (eq < 1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out.set(key, value);
    }
    return out;
  }

  /**
   * @param scoringPath defaults to `config/scoring.default.json`
   * @param envPath defaults to `src/.env`; the real process environment wins over the file, so a
   *   deployment can set secrets without shipping one.
   */
  static load(
    scoringPath = resolve(PROJECT_ROOT, 'config', 'scoring.default.json'),
    envPath = resolve(PROJECT_ROOT, 'src', '.env'),
    pestPath = resolve(PROJECT_ROOT, 'config', 'pests.default.json'),
  ): ConfigSet {
    const config = new ConfigSet();

    if (existsSync(envPath)) {
      for (const [key, value] of ConfigLoader.parseEnv(readFileSync(envPath, 'utf8'))) {
        config.setEnv(key, value);
      }
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        config.setEnv(key, value);
      }
    }

    const file = JSON.parse(readFileSync(scoringPath, 'utf8')) as ScoringFile;
    ConfigLoader.applyScoring(config, file);
    config.validateComplete();

    // The catalogue is optional at load only so that a v0.8 deployment without the file still
    // starts and still scores dengue — 4.2.5 in operational form. When the file IS present it is
    // validated strictly: a half-right catalogue is worse than none.
    if (existsSync(pestPath)) {
      ConfigLoader.applyPests(config, JSON.parse(readFileSync(pestPath, 'utf8')) as PestFile);
      config.validatePestProfiles();
    }
    return config;
  }

  /**
   * 4.2.2, 4.2.3, 4.3.7, 4.3.8, 4.4.2 — the pest catalogue.
   *
   * Weights are held per *tier*, not per pest, and attached to each profile from its tier. That is a
   * deliberate narrowing of what configuration can express: 4.3.4-4.3.6 define one driver set per
   * evidence tier, so a per-pest weight set would let two tier B pests disagree about what tier B
   * means. Widen it only if a requirement asks for it.
   */
  static applyPests(config: ConfigSet, file: PestFile): void {
    const weightsByTier = new Map<EvidenceTier, Map<Driver, number>>();
    for (const [tierName, weights] of Object.entries(file.driverWeightsByTier ?? {})) {
      const tier = Object.values(EvidenceTier).find((t) => t === tierName);
      if (tier === undefined) {
        throw new Error(`unknown evidence tier '${tierName}' in pest configuration (4.3.1)`);
      }
      const map = new Map<Driver, number>();
      for (const [name, weight] of Object.entries(weights)) {
        if (name.startsWith('$') || typeof weight !== 'number') {
          continue; // $comment keys document the file; they are not weights.
        }
        const driver = Object.values(Driver).find((d) => d === name);
        if (driver === undefined) {
          throw new Error(`unknown driver '${name}' for tier ${tierName} (4.1.3)`);
        }
        map.set(driver, weight);
      }
      weightsByTier.set(tier, map);
    }

    for (const row of file.pests ?? []) {
      const pestType = Object.values(PestType).find((p) => p === row.pestType);
      const pestClass = Object.values(PestClass).find((c) => c === row.pestClass);
      const tier = Object.values(EvidenceTier).find((t) => t === row.evidenceTier);
      if (pestType === undefined || pestClass === undefined || tier === undefined) {
        throw new Error(
          `pest row '${row.pestType}' names an unknown pest type, class or evidence tier ` +
            '(5.1.15, 4.2.3, 4.3.1)',
        );
      }
      const weights = weightsByTier.get(tier);
      if (weights === undefined) {
        throw new Error(`no driver weight set configured for evidence tier ${tier} (4.3.7)`);
      }
      const authority = file.authorities?.[row.authority ?? ''];
      if (authority?.name === undefined || authority.contactNumber === undefined) {
        // 8.6.3 shows the destination's name and published number to a resident who has just seen a
        // snake. An unnamed authority is a referral that cannot be made (6.10.EX.2).
        throw new Error(`pest ${pestType} names no known dispatch authority (4.2.3, 8.6.2)`);
      }
      config.pestProfiles.set(
        pestType,
        new PestProfile(
          pestType,
          pestClass,
          tier,
          row.severityMultiplier ?? 0,
          weights,
          authority.name,
          authority.contactNumber,
          row.observationTaxonId ?? null,
        ),
      );
    }

    config.criticalOverrideRules = ConfigLoader.parseOverrideRules(file);
  }

  private static parseOverrideRules(file: PestFile): CriticalOverrideRule[] {
    const out: CriticalOverrideRule[] = [];
    for (const [name, rule] of Object.entries(file.criticalOverrideRules ?? {})) {
      if (name.startsWith('$')) {
        continue;
      }
      out.push({
        name,
        description: rule.description ?? name,
        pestClass: Object.values(PestClass).find((c) => c === rule.pestClass),
        locationContext: Object.values(LocationContext).find((l) => l === rule.locationContext),
        injuryReported: rule.injuryReported,
      });
    }
    return out;
  }

  static applyScoring(config: ConfigSet, file: ScoringFile): void {
    for (const [name, weight] of Object.entries(file.driverWeights ?? {})) {
      const driver = Object.values(Driver).find((d) => d === name);
      if (driver === undefined) {
        throw new Error(`unknown driver '${name}' in scoring configuration (4.1.3)`);
      }
      config.driverWeights.set(driver, weight);
    }

    if (file.tierThresholds) {
      config.tierThresholds = new TierThresholds(file.tierThresholds.high, file.tierThresholds.medium);
    }

    const n = file.normalisation ?? {};
    config.normalisation = {
      caseSizeReferenceMax: n.CaseSize?.referenceMax,
      caseGrowthReferenceMax: n.CaseGrowthDelta?.referenceMax,
      rainfall24hCapMm: n.Rainfall24h?.capMm,
      rainfall72hCapMm: n.Rainfall72h?.capMm,
      openReportCap: n.VerifiedOpenReportCount?.capReports,
      treatmentSaturationDays: n.DaysSinceLastTreatment?.saturationDays,
      // v0.9 drivers keep the NormalisationFactory defaults unless the file names them; their
      // justification is in PEST-PRIORITY-MODEL.md §5 rather than SCORING-SPEC.md §2.
      reportVelocityCap: n.ReportVelocity?.capReports,
      corroborationCap: n.CorroborationDensity?.capReports,
      observationReferenceMax: n.ExternalObservationDensity?.referenceMax,
      responseDistanceCapMetres: n.ResponseCapacityDeficit?.capMetres,
    };

    for (const [name, seconds] of Object.entries(file.ingestionIntervalsSeconds ?? {})) {
      const kind = Object.values(SourceKind).find((s) => s === name);
      if (kind !== undefined) {
        config.ingestionIntervals.set(kind, seconds);
      }
    }

    const clusters = file.sources?.clusters;
    if (clusters?.datasetId) {
      config.clusterSource = {
        datasetId: clusters.datasetId,
        metadataBaseUrl: ConfigLoader.originOf(clusters.metadataUrl) ?? config.clusterSource.metadataBaseUrl,
        downloadBaseUrl: ConfigLoader.originOf(clusters.pollDownloadUrl) ?? config.clusterSource.downloadBaseUrl,
      };
    }
  }

  private static originOf(url: string | undefined): string | null {
    if (!url) {
      return null;
    }
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }
}
