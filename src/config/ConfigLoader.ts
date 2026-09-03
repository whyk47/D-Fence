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
import { Driver, SourceKind } from '../entity/enums';
import { TierThresholds } from '../entity/valueTypes';

interface ScoringFile {
  driverWeights?: Record<string, number>;
  tierThresholds?: { high: number; medium: number };
  normalisation?: Record<string, { referenceMax?: number; capMm?: number; capReports?: number; saturationDays?: number }>;
  ingestionIntervalsSeconds?: Record<string, number>;
  sources?: { clusters?: { datasetId?: string; metadataUrl?: string; pollDownloadUrl?: string } };
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
    return config;
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
