/**
 * D-Fence — the dialog map, read as data.
 * Traces: 11.3.1, 11.3.2, 11.3.3, 11.3.8.
 *
 * **Why this file exists.** 11.3.2 says the system shall permit no transition that is not defined
 * in the dialog map. That is a claim about a PlantUML diagram and a TypeScript router agreeing with
 * each other, and `lab4/TEST-PLAN.md` §5 named it the row to protect: left to eyeballing it will be
 * false within a fortnight, because the diagram and the code are edited by different people on
 * different days.
 *
 * So the diagram is parsed and the router is checked against it. The map remains the source of
 * truth — it is the graded artefact, and the one a reader can see — and this file is the mechanism
 * that stops the code drifting away from it.
 */

/** One screen: a state on the map, its route, and the requirement that names it. */
export interface DialogState {
  /** The PlantUML alias, e.g. `OpsDashboard`. */
  id: string;
  /** The human title on the diagram, e.g. `Operations Dashboard`. */
  title: string;
  /** 11.3.8 — the distinct URL. Null for a modal, which has no URL of its own (11.3.4). */
  route: string | null;
  /** The 11.2.x requirement the state is labelled with. */
  requirement: string | null;
  isModal: boolean;
}

/** One permitted move. 11.3.2 admits no others. */
export interface DialogTransition {
  from: string;
  to: string;
  /** The event label, e.g. `selectCluster`, with any controller call stripped. */
  event: string;
}

export interface DialogMap {
  states: DialogState[];
  transitions: DialogTransition[];
}

/** `state "Title\n/route  (11.2.x)" as Alias <<modal>>` */
const STATE_LINE = /^state\s+"([^"]*)"\s+as\s+(\w+)(\s+<<(\w+)>>)?/;
/** `From --> To : event / Controller.call()` */
const TRANSITION_LINE = /^(\w+)\s*-->\s*(\w+)\s*:\s*(.*)$/;

/**
 * Parses a PlantUML state diagram into states and transitions.
 *
 * Deliberately tolerant of everything it does not need — skinparams, notes, nested `state ... {`
 * regions — because the diagram is a drawing first and a data source second. A parser that broke
 * whenever someone restyled the map would be abandoned, and an abandoned conformance check is
 * worse than none: it reads as an assurance nobody is maintaining.
 */
export function parseDialogMap(puml: string): DialogMap {
  const states: DialogState[] = [];
  const transitions: DialogTransition[] = [];

  for (const raw of puml.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith("'") || line.startsWith('skinparam') || line.startsWith('note')) {
      continue;
    }

    const stateMatch = STATE_LINE.exec(line);
    if (stateMatch !== null) {
      const label = (stateMatch[1] ?? '').replace(/\\n/g, '\n');
      states.push({
        id: stateMatch[2] as string,
        title: (label.split('\n')[0] ?? '').trim(),
        route: routeOf(label),
        requirement: requirementOf(label),
        isModal: stateMatch[4] === 'modal',
      });
      continue;
    }

    const transitionMatch = TRANSITION_LINE.exec(line);
    if (transitionMatch !== null && transitionMatch[1] !== '[*]') {
      transitions.push({
        from: transitionMatch[1] as string,
        to: transitionMatch[2] as string,
        // Everything after the first `/` names the controller call, which belongs to the design
        // rather than to the navigation rule this file enforces.
        event: (transitionMatch[3] ?? '').split('/')[0]?.trim() ?? '',
      });
    }
  }

  return { states, transitions };
}

/** The `/route` fragment of a state label, or null when it has none (a modal, or a region). */
function routeOf(label: string): string | null {
  const match = /(^|\n)\s*(\/[^\s(]*)/.exec(label);
  return match === null ? null : (match[2] as string);
}

function requirementOf(label: string): string | null {
  const match = /\((\d+\.\d+\.\d+)\)/.exec(label);
  return match === null ? null : (match[1] as string);
}

/**
 * 11.3.2 — every route the application serves must be a state on the map, and every state with a
 * route must be served.
 *
 * Both directions matter, and the second is the one that catches real drift: a screen drawn on the
 * map and never built is a promise in a graded artefact that the software does not keep.
 *
 * @returns the problems found; empty means the code and the diagram agree
 */
export function conformanceProblems(map: DialogMap, servedRoutes: string[]): string[] {
  const problems: string[] = [];
  const drawn = new Set(map.states.filter((s) => s.route !== null).map((s) => s.route as string));
  const served = new Set(servedRoutes);

  for (const route of served) {
    if (!drawn.has(route)) {
      problems.push(`the application serves ${route}, which is not a state on the dialog map (11.3.2)`);
    }
  }
  for (const route of drawn) {
    if (!served.has(route)) {
      problems.push(`the dialog map draws ${route}, which the application does not serve (11.3.1)`);
    }
  }
  return problems;
}

/**
 * 11.3.3 — every screen except Sign In has a return path.
 *
 * A state inside a region inherits its region's outgoing transitions, so a screen whose only way
 * back is `signOut` at the region level still satisfies this. The check therefore looks for any
 * outgoing transition to another *screen*, and reports the ones that are dead ends.
 */
export function screensWithoutReturnPath(map: DialogMap): string[] {
  const exempt = new Set(['SignIn', 'Landing']);
  const hasOutgoing = new Set(map.transitions.filter((t) => t.from !== t.to).map((t) => t.from));
  return map.states
    .filter((s) => s.route !== null && !s.isModal && !exempt.has(s.id) && !hasOutgoing.has(s.id))
    .map((s) => s.id);
}

/** 11.3.8 — every screen addressed by a **distinct** URL. */
export function duplicateRoutes(map: DialogMap): string[] {
  const seen = new Map<string, number>();
  for (const state of map.states) {
    if (state.route !== null) {
      seen.set(state.route, (seen.get(state.route) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([route]) => route);
}

/** Whether the map permits this move. The router asks before it navigates. */
export function permits(map: DialogMap, fromScreenId: string, toScreenId: string): boolean {
  return map.transitions.some((t) => t.from === fromScreenId && t.to === toScreenId);
}
