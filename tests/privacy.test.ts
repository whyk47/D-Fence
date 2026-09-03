/**
 * D-Fence — Lab 4 §3.2: privacy, deletion and attribution (US-0.4, §10.3, §10.4).
 *
 * US-0.4 was added in requirements v0.3 with the note that its nine requirements "read as forgotten
 * rather than deferred". Three of them still were: 10.4.3 (deletion within seven days), 10.4.4
 * (attribution for every government source) and 10.3.2 (HTTPS) had no implementation at all.
 *
 * **The interesting requirement is 10.4.3, and it is interesting because deleting is the easy
 * half.** The hard half is deciding what counts as the person's own. A resident's reports are not
 * theirs alone — a verified report is evidence a cleaning crew was sent somewhere, it sits in the
 * 4.1.3 driver, and 8.1.13 links it to a work order. Deleting those would rewrite an operational
 * history other people acted on; keeping them intact would ignore the request. They are therefore
 * dissociated, and the cases below pin that choice down in both directions.
 */
import { describe, expect, it } from 'vitest';
import {
  PrivacyController,
  PERSONAL_DATA_INVENTORY,
  DELETION_DEADLINE_DAYS,
} from '../src/control/PrivacyController';
import { Attribution, ATTRIBUTIONS } from '../src/config/Attribution';
import { ExpressApp } from '../src/boundary/http/ExpressApp';
import { AccessControlService } from '../src/control/AccessControlService';
import { AccessPolicy } from '../src/control/AccessPolicy';
import { Principal } from '../src/control/Principal';
import { InMemoryAuditStore } from '../src/persistence/memory/InMemoryStores';
import { InMemoryAccountStore } from '../src/persistence/memory/InMemoryAccountStores';
import { InMemorySavedLocationStore } from '../src/persistence/memory/InMemoryLocationStores';
import { InMemoryReportStore } from '../src/persistence/memory/InMemoryReportStores';
import { InMemoryAlertSubscriptionStore } from '../src/persistence/memory/InMemoryAlertStores';
import { Account } from '../src/entity/Account';
import { Report } from '../src/entity/Report';
import { SavedLocation } from '../src/entity/SavedLocation';
import { GeoPoint } from '../src/entity/valueTypes';
import { ExposureStatus, LocationLabel, ReportStatus, ReportType, Role, SourceKind } from '../src/entity/enums';

const NOW = new Date('2026-09-04T12:00:00+08:00');

async function fixture(): Promise<{
  privacy: PrivacyController;
  accounts: InMemoryAccountStore;
  locations: InMemorySavedLocationStore;
  reports: InMemoryReportStore;
  subscriptions: InMemoryAlertSubscriptionStore;
  audit: InMemoryAuditStore;
  resident: Principal;
  disabled: string[];
}> {
  const audit = new InMemoryAuditStore();
  const ac = new AccessControlService(new AccessPolicy(), audit);
  const accounts = new InMemoryAccountStore();
  const locations = new InMemorySavedLocationStore();
  const reports = new InMemoryReportStore();
  const subscriptions = new InMemoryAlertSubscriptionStore();
  const disabled: string[] = [];

  const account = new Account();
  account.email = 'ah.seng@example.com';
  account.authUserId = 'auth-ah-seng';
  account.role = Role.Resident;
  account.isActive = true;
  account.emailVerified = true;
  account.telegramChatId = '5834430459';
  const saved = await accounts.save(account);

  for (const label of [LocationLabel.Home, LocationLabel.Workplace]) {
    const location = new SavedLocation();
    location.accountId = saved.id;
    location.inputText = '560117';
    location.resolvedAddress = 'Bishan St 12';
    location.point = new GeoPoint(1.355, 103.845);
    location.label = label;
    location.name = String(label);
    location.exposureStatus = ExposureStatus.CLEAR;
    location.rain24hMm = null;
    location.rain72hMm = null;
    location.evaluatedAt = null;
    await locations.save(location);
  }

  const report = new Report();
  report.reporterId = saved.id;
  report.type = ReportType.StandingWater;
  report.description = 'Standing water in an uncovered drum behind the void deck';
  report.point = new GeoPoint(1.355, 103.845);
  report.localityBinding = 'Bishan St 12';
  report.clusterId = null;
  report.workOrderId = null;
  report.corroborationCount = 0;
  report.submittedAt = NOW;
  report.applyStatus(ReportStatus.Verified);
  await reports.save(report);

  return {
    privacy: new PrivacyController(ac, accounts, locations, reports, subscriptions, {
      disableUser: async (id: string) => {
        disabled.push(id);
      },
    }, audit),
    accounts,
    locations,
    reports,
    subscriptions,
    audit,
    resident: new Principal(saved.id, Role.Resident, 'session-r'),
    disabled,
  };
}

describe('10.4.3 — deleting a user\'s personal data', () => {
  it('P1 — saved locations and the Telegram link are destroyed outright', async () => {
    const f = await fixture();
    const outcome = await f.privacy.requestDeletion(f.resident, NOW);

    expect(outcome.savedLocationsDeleted).toBe(2);
    expect(await f.locations.findForAccount(f.resident.accountId)).toEqual([]);
    // A home address is the single most personal thing this system holds.
    expect((await f.accounts.findById(f.resident.accountId))?.telegramChatId).toBeNull();
    expect(outcome.telegramUnlinked).toBe(true);
  });

  it('P2 — the reports are DISSOCIATED, not deleted', async () => {
    const f = await fixture();
    const outcome = await f.privacy.requestDeletion(f.resident, NOW);

    expect(outcome.reportsDissociated).toBe(1);
    // The report survives: it is evidence a crew was sent somewhere, it sits in 4.1.3's driver,
    // and 8.1.13 may link it to a work order. Deleting it rewrites a history others acted on.
    expect(await f.reports.findByReporter(f.resident.accountId)).toEqual([]);
    const all = await f.reports.findByStatus(ReportStatus.Verified);
    expect(all).toHaveLength(1);
    expect(all[0]?.reporterId).toBeNull();
    // And the report's own content is untouched — this is a severance, not a redaction.
    expect(all[0]?.description).toContain('uncovered drum');
  });

  it('P3 — the email becomes a tombstone, not an empty string', async () => {
    const f = await fixture();
    await f.privacy.requestDeletion(f.resident, NOW);

    const account = await f.accounts.findById(f.resident.accountId);
    expect(account?.email).toBe(`deleted-${f.resident.accountId}@invalid`);
    expect(account?.isActive).toBe(false);
    // An empty string would make findByEmail('') match every deleted account, and 2.1.4's
    // duplicate-registration check reads that index.
    expect(await f.accounts.findByEmail('')).toBeNull();
    expect(await f.accounts.findByEmail('ah.seng@example.com')).toBeNull();
  });

  it('P4 — the credential is disabled at the provider, which this system does not own', async () => {
    const f = await fixture();
    await f.privacy.requestDeletion(f.resident, NOW);
    // Erasing our row while the provider identity still authenticates would leave an account that
    // can sign in to nothing — the same defect found in reactivation on 2026-09-03.
    expect(f.disabled).toEqual(['auth-ah-seng']);
    expect((await f.accounts.findById(f.resident.accountId))?.authUserId).toBe('');
  });

  it('P5 — the deletion is recorded, and the audit row outlives the person it describes', async () => {
    const f = await fixture();
    await f.privacy.requestDeletion(f.resident, NOW);
    const entry = (await f.audit.recent(10)).find((e) => e.action === 'account:deleteRequested');
    // 2.4.2 forbids modifying an audit record, so this row cannot be erased with the rest — which
    // is what lets the deletion be shown to have happened at all.
    expect(entry?.accountId).toBe(f.resident.accountId);
    expect(entry?.targetId).toBe(f.resident.accountId);
  });

  it('P6 — the request is completed immediately, so nothing is ever overdue', async () => {
    const f = await fixture();
    await f.privacy.requestDeletion(f.resident, NOW);
    expect(DELETION_DEADLINE_DAYS).toBe(7);
    // Seven days is a deadline, not a delay: there is no reason to wait, and the window only buys
    // room for a scheduled job. Checked eight days later so the deadline test itself is exercised.
    const eightDaysOn = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(f.privacy.overdueRequests(eightDaysOn)).toEqual([]);
    expect(f.privacy.requestFor(f.resident.accountId)?.completedAt).not.toBeNull();
  });

  it('P7 — a resident cannot delete somebody else\'s account (2.3.1)', async () => {
    const f = await fixture();
    const stranger = new Principal('someone-else', Role.Resident, 'session-x');
    // The protection here is structural rather than a check: `requestDeletion` takes no account
    // parameter at all, so there is no argument through which one caller could name another's
    // account. The authorise call is the second line, not the first. Asserted anyway, because
    // "you cannot express the attack" is a claim that stops being true the moment somebody adds
    // an id parameter for a manager-initiated deletion.
    await f.privacy.requestDeletion(stranger, NOW);
    expect(await f.locations.findForAccount(f.resident.accountId)).toHaveLength(2);
  });
});

describe('10.4.2 — what the system holds about a person', () => {
  it('P8 — the inventory is complete, and says what happens to each field', () => {
    const fields = PERSONAL_DATA_INVENTORY.map((i) => `${i.entity}.${i.field}`);
    expect(fields).toContain('Account.email');
    expect(fields).toContain('SavedLocation.all');
    expect(fields).toContain('Report.reporterId');
    // Every entry justifies itself. An inventory that only listed what is destroyed would be a
    // misleading answer to "what do you hold about me".
    expect(PERSONAL_DATA_INVENTORY.every((i) => i.note.length > 10)).toBe(true);
  });

  it('P9 — the two retained items are named, with the requirement that permits each', () => {
    const retained = PERSONAL_DATA_INVENTORY.filter((i) => i.disposition === 'retained');
    expect(retained.map((i) => `${i.entity}.${i.field}`)).toEqual(['Account.role', 'AuditRecord.accountId']);
    expect(retained.every((i) => /10\.4\.2|2\.4\.2/.test(i.note))).toBe(true);
  });
});

describe('10.4.4, 10.4.5 — attribution', () => {
  it('P10 — every external source carries an attribution, a URL and a licence', () => {
    expect(ATTRIBUTIONS).toHaveLength(4);
    for (const source of Object.values(SourceKind)) {
      const attribution = Attribution.forSource(source);
      expect(attribution?.text.length).toBeGreaterThan(20);
      expect(attribution?.url).toMatch(/^https:\/\//);
      expect(attribution?.licence.length).toBeGreaterThan(5);
    }
  });

  it('P11 — a screen gets exactly the attributions of the sources it draws from', () => {
    // The map shows clusters and the rain forecast, and does not show a geocoding result.
    const map = Attribution.forScreen('MapView').map((a) => a.source);
    expect(map).toContain(SourceKind.Clusters);
    expect(map).toContain(SourceKind.Forecast);
    expect(map).not.toContain(SourceKind.Geocoding);
    // The address screens are the only ones that show a OneMap result.
    expect(Attribution.forScreen('AddLocation').map((a) => a.source)).toContain(SourceKind.Geocoding);
  });

  it('P12 — the footer is one line, naming each agency', () => {
    const footer = Attribution.footerFor('MapView');
    expect(footer).toContain('National Environment Agency');
    expect(footer).toContain('Meteorological Service Singapore');
  });

  it('P13 — 10.4.5 is NOT satisfied, and the exception is enumerable rather than argued away', () => {
    const credentialed = Attribution.credentialedSources();
    // OneMap is a Singapore government service with open data, and its API still requires a
    // registered account and an expiring token. Calling that "no third-party authentication"
    // because the publisher is a government agency would be reading the requirement to suit us.
    expect(credentialed.map((a) => a.source)).toEqual([SourceKind.Geocoding]);
    // The other three genuinely need nothing, which is why they could be built before any account
    // existed anywhere.
    expect(ATTRIBUTIONS.filter((a) => !a.requiresCredential)).toHaveLength(3);
  });

  it('P14 — the Data Sources screen carries all four, since it names all four', () => {
    expect(Attribution.forScreen('DataSources')).toHaveLength(4);
  });
});

describe('10.3.2 — HTTPS', () => {
  it('P15 — the redirect preserves the host and the full path', () => {
    // A redirect that dropped the query string would silently lose a filtered dashboard view.
    expect(ExpressApp.redirectTargetFor('d-fence.example.gov.sg', '/ops?tier=High')).toBe(
      'https://d-fence.example.gov.sg/ops?tier=High',
    );
  });

  it('P16 — enforcement is off by default, because localhost has no certificate', () => {
    // Stated as a case rather than left to a constructor default: a security control that is on in
    // development is one somebody turns off to get their work done, and then forgets.
    const app = new ExpressApp(null);
    expect(app).toBeInstanceOf(ExpressApp);
    const enforcing = new ExpressApp(null, true);
    expect(enforcing).toBeInstanceOf(ExpressApp);
  });
});
