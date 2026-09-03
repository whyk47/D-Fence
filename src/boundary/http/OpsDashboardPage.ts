/**
 * D-Fence — server-rendered operations dashboard.
 * Stereotype: <<boundary>>. Traces: 7.1.2–7.1.9, 7.2.1, 7.2.2, 7.2.6, 7.2.8, 7.2.9, 7.5.1, 11.5.x.
 *
 * **What this is and is not.** It is a real, visible dashboard fed by the real control classes, so
 * the operations segment of the demo can be rehearsed this week. It is *not* the graded React screen
 * (11.2.x): that one carries the dialog map, the four load states and the HCI annotations. When the
 * React client lands, this page should be deleted rather than maintained in parallel — two
 * implementations of one screen is exactly the drift the Lab 2 and Lab 3 reviews kept finding.
 *
 * It follows the design tokens fixed in `lab1/FIGMA-PROMPTS.md` so the demo and the mockups agree:
 * ground #FBFBF9, accent teal #1B5E56, tiers High #A4342B / Medium #B8763A / Low #4A7C59, IBM Plex,
 * an 8 px grid. Two content rules from the same file are enforced here rather than assumed:
 * **a tier is a word and a colour, never a colour alone**, and **every quantity carries its unit**.
 */
import { DashboardOverview, PriorityRow, AttentionItem } from '../../control/DashboardController';

/** 11.5.x — "03 Sep 2026 14:35 SGT", the one timestamp format used everywhere. */
export function formatSgt(instant: Date | null): string {
  if (instant === null) {
    return '—';
  }
  const sgt = new Date(instant.getTime() + 8 * 3_600_000);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${pad(sgt.getUTCDate())} ${months[sgt.getUTCMonth()]} ${sgt.getUTCFullYear()} ` +
    `${pad(sgt.getUTCHours())}:${pad(sgt.getUTCMinutes())} SGT`
  );
}

/** A count that is not computable yet renders as an em dash with a reason, never as 0. */
function count(value: number | null, unit: string, reason = 'not implemented yet'): string {
  return value === null ? `<span class="unknown" title="${reason}">—</span>` : `${value} <span class="unit">${unit}</span>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function renderOpsDashboard(
  overview: DashboardOverview,
  rows: PriorityRow[],
  attention: AttentionItem[],
): string {
  const tierClass: Record<string, string> = { High: 'high', Medium: 'medium', Low: 'low' };

  const tableRows = rows
    .map((r) => {
      const degraded = r.isDegraded
        ? `<div class="degraded">DEGRADED — excluded: ${r.excludedDrivers.join(', ')}</div>`
        : '';
      const breakdown = r.breakdown
        .map(
          (c) =>
            `<tr><td>${c.driver}</td><td class="num">${c.raw.toFixed(2)}</td>` +
            `<td class="num">${c.normalised.toFixed(3)}</td><td class="num">${c.weight.toFixed(2)}</td>` +
            `<td class="num">${c.contribution.toFixed(3)}</td></tr>`,
        )
        .join('');
      return `
      <tr>
        <td class="num">${r.rank}</td>
        <td class="locality">${escapeHtml(r.locality)}${degraded}</td>
        <td class="num">${r.caseSize} <span class="unit">cases</span></td>
        <td class="num">${r.caseDelta >= 0 ? '+' : ''}${r.caseDelta}</td>
        <td class="num">${r.rainfall24hMm === null ? '—' : `${r.rainfall24hMm.toFixed(1)} <span class="unit">mm</span>`}</td>
        <td class="num">${r.daysSinceLastTreatment === null ? '—' : `${r.daysSinceLastTreatment} <span class="unit">d</span>`}</td>
        <td class="num score">${r.score.toFixed(1)}</td>
        <td><span class="tier ${tierClass[r.tier] ?? 'low'}">${r.tier}</span></td>
      </tr>
      <tr class="breakdown">
        <td></td>
        <td colspan="7">
          <details>
            <summary>Driver breakdown (7.2.6)</summary>
            <table class="inner">
              <thead><tr><th>Driver</th><th>Raw</th><th>Normalised</th><th>Weight</th><th>Contribution</th></tr></thead>
              <tbody>${breakdown}</tbody>
            </table>
          </details>
        </td>
      </tr>`;
    })
    .join('');

  const attentionItems =
    attention.length === 0
      ? '<li class="ok">No source warnings.</li>'
      : attention.map((a) => `<li><a href="${a.link}">${escapeHtml(a.detail)}</a></li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>D-Fence — Operations</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- 7.1.8: refresh at most five minutes apart without a manual reload. -->
<meta http-equiv="refresh" content="300">
<style>
  :root {
    --ground: #FBFBF9; --ink: #1A1A18; --muted: #6B6B63; --line: #E2E2DD;
    --accent: #1B5E56; --high: #A4342B; --medium: #B8763A; --low: #4A7C59;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: var(--ground); color: var(--ink);
         font-family: "IBM Plex Sans", -apple-system, system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .as-of { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .cards { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
  .card { flex: 1 1 160px; border: 1px solid var(--line); border-radius: 6px; padding: 12px 16px; background: #fff; }
  .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  .card .value { font-size: 24px; font-family: "IBM Plex Mono", ui-monospace, monospace; margin-top: 4px; }
  .unit { color: var(--muted); font-size: 13px; font-family: "IBM Plex Sans", sans-serif; }
  .unknown { color: var(--muted); cursor: help; }
  table { width: 100%; border-collapse: collapse; background: #fff; font-size: 14px; }
  th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
  th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
  .num { text-align: right; font-family: "IBM Plex Mono", ui-monospace, monospace; }
  .score { font-weight: 600; }
  .locality { max-width: 340px; }
  .tier { display: inline-block; padding: 2px 8px; border-radius: 3px; color: #fff; font-size: 12px; }
  .tier.high { background: var(--high); } .tier.medium { background: var(--medium); } .tier.low { background: var(--low); }
  .degraded { color: var(--high); font-size: 12px; margin-top: 4px; }
  .breakdown td { padding-top: 0; border-bottom: 1px solid var(--line); }
  .inner { font-size: 12px; margin-top: 8px; }
  summary { cursor: pointer; color: var(--accent); font-size: 12px; }
  .panel { border: 1px solid var(--line); border-radius: 6px; padding: 12px 16px; background: #fff; margin-bottom: 24px; }
  .panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 8px; }
  .panel ul { margin: 0; padding-left: 18px; } .ok { color: var(--muted); list-style: none; margin-left: -18px; }
  footer { color: var(--muted); font-size: 12px; margin-top: 24px; }
</style></head>
<body>
  <h1>D-Fence — Operations</h1>
  <div class="as-of">Data as of ${formatSgt(overview.dataAsOf)} · ${rows.length} clusters scored</div>

  <div class="cards">
    <div class="card"><div class="label">Active clusters</div><div class="value">${overview.activeClusters}</div></div>
    <div class="card"><div class="label">Active cases</div><div class="value">${overview.totalActiveCases} <span class="unit">cases</span></div></div>
    <div class="card"><div class="label">High tier</div><div class="value">${overview.highTierClusters}</div></div>
    <div class="card"><div class="label">Open verified reports</div><div class="value">${count(overview.openVerifiedReports, '')}</div></div>
    <div class="card"><div class="label">Open work orders</div><div class="value">${count(overview.openWorkOrders, '')}</div></div>
    <div class="card"><div class="label">Overdue</div><div class="value">${count(overview.overdueWorkOrders, '')}</div></div>
  </div>

  <div class="panel">
    <h2>Attention (7.5)</h2>
    <ul>${attentionItems}</ul>
  </div>

  <table>
    <thead><tr>
      <th class="num">#</th><th>Locality</th><th class="num">Cases</th><th class="num">Δ</th>
      <th class="num">Rain 24 h</th><th class="num">Untreated</th><th class="num">Score</th><th>Tier</th>
    </tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <footer>
    Tier distribution — High ${overview.tierDistribution.High} · Medium ${overview.tierDistribution.Medium} ·
    Low ${overview.tierDistribution.Low}. Scores are read from the last scoring cycle, never recomputed
    for display (7.2.1). An em dash means the value is not computable yet, not zero.
    <a href="/api/ops/priority.csv">Export CSV</a> (7.4.2).
  </footer>
</body></html>`;
}
