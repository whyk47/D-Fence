/**
 * D-Fence — application shell and navigation.
 * Traces: 11.1.1-11.1.8, 10.5.1.
 */
import { Role } from '../../../src/entity/enums';

export type NavItem = { label: string; route: string };

/** 11.1.3: the Work Orders item opens the Work Order List screen (11.2.25). */
export function navigationFor(_role: Role): NavItem[] {
  throw new Error('not implemented');
}

export function AppShell(): JSX.Element {
  throw new Error('not implemented');
}
