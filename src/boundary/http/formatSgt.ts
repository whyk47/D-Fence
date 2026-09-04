/**
 * D-Fence — the one timestamp format.
 * Stereotype: <<boundary>>. Traces: 11.5.x, 11.6.4.
 *
 * "04 Sep 2026 14:35 SGT", everywhere, on every surface. Lifted out of the server-rendered
 * dashboard when that page was deleted: the page was a development stand-in and is gone, but the
 * format is a stated presentation rule and outlives it.
 *
 * Singapore time is applied by adding eight hours and reading the UTC components, rather than by
 * `toLocaleString` with a time zone: the latter depends on the host's ICU data being complete,
 * which is not true of every Node build, and a demonstration machine that silently prints UTC would
 * make every timestamp on screen eight hours wrong in a way nobody notices until someone checks.
 */
export function formatSgt(instant: Date | null): string {
  if (instant === null) {
    // 10.5.4 — an unknown time is an em dash, never "now" and never the epoch.
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
