/**
 * D-Fence — the navigation glyphs.
 * Stereotype: <<boundary>>. Traces: 11.1.1–11.1.4, 11.7.5, 11.8.x.
 *
 * The Figma screens draw every navigation item as an 18×18 stroked glyph beside its label, and the
 * phone screens draw a 22×22 one above it. These are those glyphs, transcribed from the design
 * file's own inline SVG rather than pulled from an icon package — the design ships them as paths,
 * so a dependency would only be a way of getting something slightly different.
 *
 * **The glyph is never the label.** 11.7.5 forbids carrying meaning in appearance alone, and an
 * icon is exactly that. Every item renders its word too; `aria-hidden` here says so to a screen
 * reader, which would otherwise announce a decorative shape between two useful ones. The bottom
 * bar on a phone shrinks the word, it does not drop it.
 *
 * `stroke="currentColor"` throughout, so the active/inactive colouring is decided once in the
 * stylesheet by the same rule that colours the label, and the two can never disagree.
 */

/** The paths, keyed by the `screenId` the route table already uses. */
const PATHS: Record<string, string[]> = {
  // — Resident —
  ResidentMap: ['M2 6.5L8 4L14 6.5L20 4V17L14 19.5L8 17L2 19.5V6.5Z', 'M8 4V17M14 6.5V19.5'],
  MyLocations: ['M11 2C8.24 2 6 4.24 6 7c0 4.25 5 11 5 11s5-6.75 5-11c0-2.76-2.24-5-5-5z', 'M11 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z'],
  MyReports: ['M4.5 2.5h13v17h-13z', 'M8 8h6M8 12h4'],
  AlertSettings: ['M11 3a4.5 4.5 0 0 0-4.5 4.5c0 4-2 5-2 5h13s-2-1-2-5A4.5 4.5 0 0 0 11 3z', 'M9.6 18a1.7 1.7 0 0 0 2.8 0'],

  // — Operations —
  OpsDashboard: ['M2 2h7v7H2zM13 2h7v7h-7zM2 13h7v7H2zM13 13h7v7h-7z'],
  Analytics: ['M3 19V9M8.3 19V4M13.7 19v-7M19 19V6'],
  ModQueue: ['M11 2.5L4.5 5.5v5.4c0 4.2 3 7.8 6.5 8.6 3.5-.8 6.5-4.4 6.5-8.6V5.5L11 2.5z', 'M8 11l2.2 2.2L14.5 9'],
  DispatchProposal: ['M2.5 4.5h17M2.5 10h17M2.5 15.5h10', 'M15.5 13.5l2.5 2-2.5 2'],
  WOList: ['M4 2.5h14v17H4z', 'M7.5 7h7M7.5 11h7M7.5 15h4.5'],
  StaffAccounts: ['M8.5 10.5a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z', 'M2.5 19c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6', 'M15 4.2a3.2 3.2 0 0 1 0 6.2M16.5 13.8c1.9.6 3 2.5 3 4.6'],
  DataSources: ['M11 8.2c3.9 0 7-1.4 7-3.1S14.9 2 11 2 4 3.4 4 5.1s3.1 3.1 7 3.1z', 'M4 5.1V11c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1V5.1', 'M4 11v5.9c0 1.7 3.1 3.1 7 3.1s7-1.4 7-3.1V11'],

  // — Crew —
  MyJobs: ['M3 6.5h16v13H3z', 'M7.5 6.5V4.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2', 'M8 13l2.2 2.2L14.6 11'],
};

/** The fallback: a plain square, so an unmapped screen still lines up rather than collapsing. */
const FALLBACK = ['M3 3h16v16H3z'];

export interface NavIconProps {
  screenId: string;
}

export function NavIcon(props: NavIconProps): JSX.Element {
  const paths = PATHS[props.screenId] ?? FALLBACK;
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 22 22"
      width="22"
      height="22"
      fill="none"
      // Decorative: the label beside it carries the meaning (11.7.5).
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
