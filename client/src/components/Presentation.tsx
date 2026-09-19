/**
 * D-Fence — the four presentation primitives every detail screen was missing.
 * Traces: 11.4.x, 11.7.x, 5.3.4, 8.3.6, 10.3.5. Design: lab4/TEST-PLAN.md §6.17.
 *
 * **What this file is a response to.** A pass over photographs of all twenty-eight screens found
 * the same shape on nearly every one of them: a column of `<p data-part="…">` elements, one fact
 * per line, each rendered as undifferentiated body text with no label. Report Review read
 *
 *     StandingWater
 *     Submitted
 *     Jln Kayu / Jln Tari Dulang, Payong, …
 *     UAT — standing water in a disused pot behind the void deck.
 *     Submitted 2026-09-04 06:42
 *     0 corroboration(s)
 *
 * — six facts, five of which the reader has to infer the *name* of from the value. Every one of
 * those screens passes its tests, because a test asks whether the text is present and it is.
 *
 * So rather than restyle twenty screens, four components:
 *
 *   - `Facts` — a real `<dl>`. The label is the thing that was missing, and a definition list is
 *     what a labelled fact *is*, so screen readers get it for free.
 *   - `Pill` — the tier/status chip. The Figma direction is emphatic that a tier is "ALWAYS a text
 *     label plus colour, never colour alone", and the dispatch list was tinting the locality name
 *     and calling that the tier.
 *   - `PhotoGrid` — images, as images. See its own comment: this is the half of the photograph
 *     story that had no route behind it until `ImageRoutes` was written.
 *   - `Sparkline` — a number's history as a shape. The charts drew a bare polyline with no axis and
 *     then printed the same thirty numbers underneath in a table, which is not a chart with a
 *     table, it is a table with a decoration.
 */
import { JSX, useEffect, useState } from 'react';
import { SESSION_KEY } from '../lib/SessionPersistence';

/**
 * A labelled fact list.
 *
 * Entries whose value is `null` or `''` are dropped rather than rendered empty — a detail screen
 * showing "Assigned to —" for an unassigned job is stating a fact that has no meaning, and the
 * caller who wants to say "nobody" can say so in the value.
 */
export function Facts(props: {
  items: Array<{ label: string; value: React.ReactNode; part?: string; wide?: boolean }>;
}): JSX.Element {
  const shown = props.items.filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
  return (
    <dl data-component="facts">
      {shown.map((item) => (
        <div key={item.label} data-part={item.part ?? undefined} data-wide={item.wide === true ? 'true' : undefined}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A tier, status or classification, as a word in a coloured chip.
 *
 * `tone` carries the meaning; `data-tier` is set as well when the tone is a priority tier, so the
 * existing tier colours in `styles.css` continue to be the single definition of what High looks
 * like. A pill with no `tone` is neutral, which is the right default for a status nobody has
 * decided the severity of.
 */
export function Pill(props: {
  children: React.ReactNode;
  tone?: 'critical' | 'high' | 'medium' | 'low' | 'good' | 'warn' | 'bad' | 'neutral';
  tier?: string;
  title?: string;
}): JSX.Element {
  return (
    <span
      data-component="pill"
      data-tone={props.tone ?? 'neutral'}
      data-tier={props.tier ?? undefined}
      title={props.title ?? undefined}
    >
      {props.children}
    </span>
  );
}

/** The tone a work order or report status should wear. Kept beside `Pill` so it is one lookup. */
export function statusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  switch (status) {
    case 'Verified':
    case 'Completed':
    case 'Closed':
    case 'Actioned':
      return 'good';
    case 'Rejected':
    case 'Cancelled':
      return 'bad';
    case 'Submitted':
    case 'Created':
    case 'Assigned':
    case 'Accepted':
    case 'InProgress':
      return 'warn';
    default:
      return 'neutral';
  }
}

/** A priority tier's tone, so `Pill` and the table cells agree without either knowing the other. */
export function tierTone(tier: string): 'critical' | 'high' | 'medium' | 'low' | 'neutral' {
  switch (tier) {
    case 'Critical':
      return 'critical';
    case 'High':
      return 'high';
    case 'Medium':
      return 'medium';
    case 'Low':
      return 'low';
    default:
      return 'neutral';
  }
}

/**
 * One photograph, fetched through a link that expires.
 *
 * **Why an extra request per image.** 10.3.5 requires photographs to be served only through
 * authenticated, non-enumerable URLs, so there is no `src` a screen can simply compose: the key
 * names an object in a private bucket, and `GET /api/images/…` is what turns a key the caller is
 * authorised for into a five-minute link. The alternative — proxying the bytes through the
 * application — puts five megabytes per photograph through a Node process for no gain.
 *
 * The link is fetched on mount and never cached across a reload, so its expiry is not something a
 * user meets. If it cannot be fetched the tile says why, in words: a broken-image icon tells the
 * manager nothing, and "no longer stored" and "you are not permitted to see this" are different
 * facts they may need to act on.
 */
function Photo(props: { path: string; storageKey: string; alt: string }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const token = window.localStorage.getItem(SESSION_KEY);
    fetch(`/api/images/${props.path}/${encodeURIComponent(props.storageKey)}`, {
      headers: token === null ? {} : { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const body = (await response.json()) as { url?: string; error?: string };
        if (!live) {
          return;
        }
        if (response.ok && typeof body.url === 'string') {
          setUrl(body.url);
        } else {
          setFailure(body.error ?? 'the photograph could not be loaded');
        }
      })
      .catch(() => {
        if (live) {
          setFailure('the photograph could not be loaded');
        }
      });
    return () => {
      live = false;
    };
  }, [props.path, props.storageKey]);

  if (failure !== null) {
    return (
      <li data-part="photo" data-state="failed">
        <p>{failure}</p>
      </li>
    );
  }
  if (url === null) {
    return <li data-part="photo" data-state="loading" aria-busy="true" />;
  }
  return (
    <li data-part="photo">
      {/* Opens the full-size image in its own tab. The signed link is already in hand, so this
          costs nothing and is the whole of "enlarge it" on both a laptop and a phone. */}
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={props.alt} loading="lazy" />
      </a>
    </li>
  );
}

export function PhotoGrid(props: {
  /**
   * The route prefix that decides who may look: `report/<reportId>` for a report's photographs,
   * whose disclosure rule is 5.3.5 and therefore belongs to the report; `completion-evidence` for
   * a crew's evidence, which 2.3.4 gives to the Operations Manager outright.
   */
  path: string;
  photos: Array<{ id?: string; storageKey?: string; filename?: string }>;
  emptyMessage: string;
}): JSX.Element {
  // A photograph row whose `storageKey` is absent is a row the server did not project, not a
  // photograph that is missing — and showing nothing for it would be the same silent failure this
  // whole component exists to end.
  const usable = props.photos.filter((photo) => typeof photo.storageKey === 'string' && photo.storageKey !== '');
  if (usable.length === 0) {
    return (
      <p data-part="photos" data-state="empty">
        {props.emptyMessage}
      </p>
    );
  }
  return (
    <ul data-part="photos" data-component="photo-grid">
      {usable.map((photo, index) => (
        <Photo
          key={photo.id ?? photo.storageKey}
          path={props.path}
          storageKey={photo.storageKey as string}
          alt={photo.filename ?? `Photograph ${index + 1}`}
        />
      ))}
    </ul>
  );
}

/**
 * A series as a shape, with its own axis.
 *
 * Drawn as an SVG with a `viewBox` and `preserveAspectRatio="none"` so it fills whatever width the
 * card gives it without the caller computing pixels. Three things the previous charts did not do:
 * the baseline is drawn, the extremes are labelled, and the area under the line is filled — an
 * unfilled polyline floating in white space reads as a divider, not as data.
 *
 * `points` fewer than two renders nothing and says so. §7.3's sufficiency statements exist for
 * exactly that case, and a line through one point is a claim the data cannot support.
 */
export function Sparkline(props: {
  points: Array<{ label: string; value: number }>;
  unit?: string;
  height?: number;
}): JSX.Element {
  const values = props.points.map((p) => p.value);
  if (values.length < 2) {
    return <p data-part="insufficient">Not enough days yet to draw a line.</p>;
  }
  const height = props.height ?? 64;
  const max = Math.max(...values);
  const min = Math.min(...values);
  /*
    A flat series is the common case on a young deployment — 73, 73, 73 — and it is the one this
    has to get right. Dividing by a zero span is the obvious bug; drawing the result along the
    bottom of the frame under a tall empty box is the subtler one, which is what the first version
    did and what a photograph of Cluster Detail showed: a hairline at the foot of a hundred pixels
    of white, reading as "no data" rather than as "this did not move".

    So a flat series is drawn across the middle, with the fill beneath it, which is the honest
    picture: a quantity that held steady.
  */
  const flat = max - min === 0;
  const span = flat ? 1 : max - min;
  const step = 100 / (values.length - 1);
  const y = (value: number): number =>
    flat ? height / 2 : height - ((value - min) / span) * (height - 4) - 2;
  const line = values.map((value, index) => `${index * step},${y(value)}`).join(' ');
  const peak = props.points[values.indexOf(max)];
  const last = props.points[props.points.length - 1];

  return (
    <div data-component="sparkline">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={`${values.length} points, peak ${max}`}>
        <polygon points={`0,${height} ${line} 100,${height}`} data-part="area" />
        <polyline points={line} data-part="line" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1={height - 1} x2="100" y2={height - 1} data-part="axis" vectorEffect="non-scaling-stroke" />
      </svg>
      <p data-part="scale">
        <span>
          peak <strong>{max}</strong>
          {props.unit === undefined ? '' : ` ${props.unit}`}
          {peak === undefined ? '' : ` on ${peak.label}`}
        </span>
        <span>
          latest <strong>{last?.value ?? 0}</strong>
          {props.unit === undefined ? '' : ` ${props.unit}`}
        </span>
      </p>
    </div>
  );
}
